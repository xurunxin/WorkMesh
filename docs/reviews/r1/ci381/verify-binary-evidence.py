"""校验 Git blob 中的 CI381 工件；只用 Python 标准库，不修改索引或 Git 暂存区。"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import subprocess
import sys
import zlib
import zipfile

ROOT = Path(__file__).resolve().parents[4]
DIRECTORY = "docs/reviews/r1/ci381/"
REDACTED = "[REDACTED_TEST_SECRET]"
BINARY_PATHS = ["ci-failure.png", "control2/failure.png", "raw.redacted.zip",
                "readable-source.redacted.zip", "trace.redacted.zip"]


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, stderr=subprocess.PIPE)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def decode_png(data):
    """校验全部块 CRC、解压并还原每行像素；本批截图为非隔行 8 位 RGB/RGBA。"""
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "PNG 签名损坏"
    pos, compressed, dimensions, ended = 8, bytearray(), None, False
    while pos < len(data):
        length = struct.unpack_from(">I", data, pos)[0]
        kind = data[pos + 4:pos + 8]
        payload = data[pos + 8:pos + 8 + length]
        assert len(payload) == length and pos + 12 + length <= len(data), "PNG 块截断"
        crc = struct.unpack_from(">I", data, pos + 8 + length)[0]
        assert zlib.crc32(kind + payload) & 0xffffffff == crc, "PNG 块 CRC 错误"
        if kind == b"IHDR":
            assert dimensions is None and pos == 8 and length == 13
            w, h, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            assert w > 0 and h > 0 and depth == 8 and color in (2, 6)
            assert (compression, filtering, interlace) == (0, 0, 0)
            dimensions = (w, h, 3 if color == 2 else 4)
        elif kind == b"IDAT":
            compressed.extend(payload)
        elif kind == b"IEND":
            assert length == 0 and pos + 12 == len(data), "PNG 尾部异常"
            ended = True
        pos += length + 12
    assert ended and dimensions is not None
    w, h, bpp = dimensions
    decoder = zlib.decompressobj()
    pixels = decoder.decompress(compressed) + decoder.flush()
    assert decoder.eof and not decoder.unused_data
    stride = w * bpp
    assert len(pixels) == h * (stride + 1), "PNG 像素长度错误"
    previous = bytearray(stride)
    decoded = hashlib.sha256()
    for row in range(h):
        start = row * (stride + 1)
        mode = pixels[start]
        assert mode in range(5), "PNG 行过滤器错误"
        current = bytearray(pixels[start + 1:start + 1 + stride])
        for i in range(stride):
            left = current[i - bpp] if i >= bpp else 0
            up = previous[i]
            corner = previous[i - bpp] if i >= bpp else 0
            if mode == 0:
                value = 0
            elif mode == 1:
                value = left
            elif mode == 2:
                value = up
            elif mode == 3:
                value = (left + up) // 2
            else:
                prediction = left + up - corner
                distances = (abs(prediction - left), abs(prediction - up), abs(prediction - corner))
                value = (left, up, corner)[distances.index(min(distances))]
            current[i] = (current[i] + value) & 255
        decoded.update(current)
        previous = current
    return {"width": w, "height": h, "pixelSha256": decoded.hexdigest(), "chunkCrc": "全部通过"}


def check_trace(members):
    counts = {"storageState": 0, "cookies": 0, "sensitiveHeaders": 0}
    for name, data in members.items():
        if not name.endswith((".trace", ".network")):
            continue
        for line in data.decode("utf8").splitlines():
            row = json.loads(line)
            if row.get("type") == "context-options" and "storageState" in row.get("options", {}):
                assert row["options"]["storageState"] == {"redacted": True}, "storageState 未脱敏"
                counts["storageState"] += 1
            if row.get("type") == "resource-snapshot":
                for side in ("request", "response"):
                    value = row["snapshot"][side]
                    for cookie in value.get("cookies", []):
                        assert cookie["value"] == REDACTED, "trace Cookie 未脱敏"
                        counts["cookies"] += 1
                    for header in value.get("headers", []):
                        if header["name"].lower() in ("cookie", "set-cookie", "authorization"):
                            assert header["value"] == REDACTED, "trace 请求鉴权未脱敏"
                            counts["sensitiveHeaders"] += 1
    assert counts["storageState"] and counts["cookies"] and counts["sensitiveHeaders"]
    return counts


def source_secrets(directory):
    """原值只在内存中用于比对，不输出、不保存；来源目录不能在仓库内。"""
    source = Path(directory).resolve()
    assert not source.is_relative_to(ROOT), "原秘密来源须位于仓库外"
    secrets = set()
    for line in (source / "job.log").read_text(encoding="utf-8-sig").splitlines():
        match = re.search(r"\b(?:WORKMESH_BOOTSTRAP_TOKEN|WORKMESH_MASTER_KEY|AUTH_RATE_LIMIT_HMAC_KEY|PAGINATION_CURSOR_KEYS|SESSION_SECRET): (.+)$", line)
        if match and match[1] != "***":
            secrets.add(match[1].strip())
    traces = list((source / "playwright/test-results").glob("project-editor*/trace.zip"))
    assert traces, "缺少临时原 trace"
    for path in traces:
        with zipfile.ZipFile(path) as archive:
            for name in archive.namelist():
                if not name.endswith((".trace", ".network")):
                    continue
                for line in archive.read(name).decode("utf8").splitlines():
                    row = json.loads(line)
                    if row.get("type") == "context-options":
                        secrets.update(c["value"] for c in row.get("options", {}).get("storageState", {}).get("cookies", []))
                    if row.get("type") == "resource-snapshot":
                        for side in ("request", "response"):
                            secrets.update(c["value"] for c in row["snapshot"][side].get("cookies", []))
    return {value.encode("utf8") for value in secrets if len(value) >= 16}


def verify(ref=None, secret_source=None):
    # candidate 通过 Git 过滤器生成真实对象再读回，不以扩展名推测提交字节。
    cache = {}

    def path_blob(path):
        if path not in cache:
            if ref:
                oid = git("rev-parse", ref + ":" + path).decode().strip()
            else:
                oid = git("hash-object", "-w", "--path", path, path).decode().strip()
            cache[path] = (oid, git("cat-file", "blob", oid))
        return cache[path]

    def blob(relative):
        return path_blob(DIRECTORY + relative)

    index = json.loads(blob("evidence-index.json")[1])
    secrets = source_secrets(secret_source) if secret_source else set()
    archives, binary_results = {}, []
    for relative in BINARY_PATHS:
        oid, data = blob(relative)
        entry = next(e for e in index["derivedFiles"] if e["path"] == relative)
        assert len(data) == entry["gitUtf8Bytes"] and sha(data) == entry["gitUtf8Sha256"], relative + " 的实际 Git blob 字节/哈希与索引不符"
        assert oid == entry["expectedBlobId"], relative + " 的 Git blob ID 不符"
        assert sha(data) == entry["worktreeSha256"], relative + " 经文本转换改变"
        if not ref:
            assert git("check-attr", "text", "--", DIRECTORY + relative).decode().strip().endswith(": unset"), relative + " 缺少 -text"
        result = {"path": relative, "blob": oid, "bytes": len(data), "sha256": sha(data)}
        if relative.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                assert archive.testzip() is None, relative + " ZIP CRC 错误"
                archives[relative] = {name: archive.read(name) for name in archive.namelist()}
                result.update({"zipCrc": "全部通过", "members": len(archives[relative])})
        else:
            result["pngDecode"] = decode_png(data)
        binary_results.append(result)
    trace_redaction = check_trace(archives["trace.redacted.zip"])
    for entry in index["rawMembers"]:
        assert sha(archives["raw.redacted.zip"][entry["path"]]) == entry["derivedSha256"]
    for entry in index["displayNormalization"]["entries"]:
        assert sha(archives["readable-source.redacted.zip"][entry["path"]]) == entry["beforeDisplaySha256"]
        assert sha(blob(entry["path"])[1]) == entry["displaySha256"]
    for entry in index["derivedFiles"]:
        oid, data = blob(entry["path"])
        assert oid == entry["expectedBlobId"] and len(data) == entry["gitUtf8Bytes"] and sha(data) == entry["gitUtf8Sha256"], entry["path"] + " 的实际 Git blob 与索引不符"
        values = archives.get(entry["path"], {entry["path"]: data}).values()
        assert not any(secret in value for value in values for secret in secrets), entry["path"] + " 存在原测试秘密"
    manifest = json.loads(path_blob("docs/reviews/r1/execution-manifest.json")[1])
    assert manifest["manifestSelfExcluded"] and len({e["path"] for e in manifest["files"]}) == len(manifest["files"])
    for entry in manifest["files"]:
        oid, data = path_blob(entry["path"])
        assert oid == entry["expectedBlobId"] and len(data) == entry["expectedCommitBytes"] and sha(data) == entry["expectedCommitSha256"], entry["path"] + " 的实际 Git blob 与执行清单不符"
    return {"mode": "提交读取" if ref else "候选 Git 对象读取（未提交）", "ref": ref,
            "producerHead": git("rev-parse", "HEAD").decode().strip(),
            "indexedFiles": len(index["derivedFiles"]), "manifestFiles": len(manifest["files"]), "binaryFiles": binary_results,
            "traceRedaction": trace_redaction,
            "knownSourceSecretScan": "原值比对通过" if secrets else "未提供仓库外原值来源；仅结构化鉴权脱敏校验",
            "result": "工件检查通过；不代表独审或最新 Required CI"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", help="读取精确提交；不指定时读取候选 Git 对象")
    parser.add_argument("--secret-source", help="仓库外临时原 artifact 目录，仅供原值比对")
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.ref, args.secret_source), ensure_ascii=False, indent=2))
    except (AssertionError, KeyError, ValueError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        print("CI381 Git blob 工件校验失败：" + str(error), file=sys.stderr)
        sys.exit(1)

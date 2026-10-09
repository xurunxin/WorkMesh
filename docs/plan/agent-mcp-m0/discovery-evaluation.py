"""仅对受控方案事实求值；不调用产品API或代替授权实现。"""
def evaluate_predicates(gates,facts):
 for g in gates:
  if g.get("when") and not all(facts.get(k)==v for k,v in g["when"].items()):continue
  if facts.get(g["fact"]) not in g["allowed"]:return {"status":"blocked","reason":g["reason"],"failedFact":g["fact"]}
 return {"status":"eligible","reason":None}

def validate_binding(b,syntax):
 p=b["proposed"];name=b["bindingId"].split(":",1)[1]
 if b["current"]:
  assert set(b["current"]["inputFields"])==set(syntax["inputFields"])
  assert b["current"]["sdkMethods"]==syntax["sdkMethods"]
  target=p["targetParameter"]
  if target:assert target in syntax["inputFields"] or target in syntax["uriParameters"],("目标不是实际输入",name,target)
 if name in ["verify_connection","get_current_identity"]:
  assert not syntax["inputFields"]
  assert p["identityBinding"]=="current_coordination" and p["targetParameter"] is None and p["unspecifiedTarget"] is None
  assert all(not v["installationBridgeRequired"] for v in p["identityVariants"])
 if name=="verify_connection":
  assert set(syntax["sdkMethods"])=={"getAgentCapabilities","getCurrentAgentConnectionIdentity","listTeams"}
  assert set(p["operationIds"])=={"getAgentCapabilityManifest","getCurrentAgentConnectionIdentity","listTeams"}
 if name=="claim_work_item":
  assert "sessionId" not in syntax["inputFields"] and p["targetParameter"] is None
  assert set(syntax["sdkMethods"])=={"claimWorkItem","exchangeClaimedSessionToken"}
  assert p["identityBinding"]=="current_coordination"
  assert p["postClaimExchange"]["newSessionIdSource"]=="claim响应session.id"
  assert p["postClaimExchange"]["exchangeTokenSource"]=="claim响应exchangeToken"
  assert not p["postClaimExchange"]["installationBridgeRequired"]
 if any(v["variant"]=="self_execution" for v in p["identityVariants"]):
  self_v=next(v for v in p["identityVariants"] if v["variant"]=="self_execution")
  target_v=next(v for v in p["identityVariants"] if v["variant"]=="target_execution")
  assert self_v["credentialMode"]=="agent_session" and not self_v["installationBridgeRequired"]
  assert self_v["targetEqualsManifestSession"] and self_v["rejectDifferentSession"]
  assert target_v["credentialMode"]=="coordination_connection" and target_v["installationBridgeRequired"]
  assert target_v["absentTarget"]["status"]=="requires_target_check" and not target_v["absentTarget"]["countedInAllowedOperations"]

def project_binding(b,identity,mode="read-write",target=None,bridge=False,target_qualification=False,operation_qualification=True):
 p=b["proposed"]
 if mode not in p["mode"]:return {"status":"blocked","reason":"READ_ONLY","allowedOperations":[]}
 if not operation_qualification:return {"status":"blocked","reason":"OPERATION_QUALIFICATION_DENIED","allowedOperations":[]}
 if p.get("advertisedRoleDenial"):return {"status":"blocked","reason":"HUMAN_ONLY","allowedOperations":[]}
 if p["execution"]=="adapter_internal":return {"status":"eligible","reason":None,"allowedOperations":[]}
 kind=p["identityBinding"]
 if kind=="current_coordination" and identity["credentialMode"]!="coordination_connection":
  return {"status":"blocked","reason":"CREDENTIAL_MODE_MISMATCH","allowedOperations":[]}
 if kind=="installation_target" and identity["credentialMode"]!="installation_target":
  return {"status":"blocked","reason":"CREDENTIAL_MODE_MISMATCH","allowedOperations":[]}
 if kind=="explicit_identity_variants":
  if identity["credentialMode"]=="agent_session":
   # 发现没有调用参数；自身id已由manifest确定。实际call缺必填字段仍由原schema拒绝。
   if target is not None and target!=identity["sessionId"]:return {"status":"blocked","reason":"AGENT_SESSION_TOKEN_MISMATCH","allowedOperations":[]}
   return {"status":"eligible","reason":None,"selectedVariant":"self_execution","allowedOperations":p["operationIds"]}
  if identity["credentialMode"]=="coordination_connection":
   if not bridge:return {"status":"blocked","reason":"INSTALLATION_BRIDGE_REQUIRED","allowedOperations":[]}
   if target is None:return {"status":"requires_target_check","reason":"TARGET_CHECK_REQUIRED","allowedOperations":[]}
   if not target_qualification:return {"status":"blocked","reason":"TARGET_QUALIFICATION_DENIED","allowedOperations":[]}
   return {"status":"eligible","reason":None,"selectedVariant":"target_execution","allowedOperations":[],"targetOperations":p["operationIds"]}
  return {"status":"blocked","reason":"CREDENTIAL_MODE_MISMATCH","allowedOperations":[]}
 return {"status":"eligible","reason":None,"allowedOperations":p["operationIds"]}

def context_allowed(projection):
 return sorted({op for entry in projection if entry["status"]=="eligible" for op in entry["allowedOperations"]})

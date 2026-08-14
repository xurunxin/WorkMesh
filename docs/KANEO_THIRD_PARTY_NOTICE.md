# Kaneo third-party notice and provenance policy

Status: provenance notice established; no Kaneo implementation, asset, font, icon, translation, or product copy has been imported by GEN-3.

Pinned source: [usekaneo/kaneo at `a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41)

Source audit: [`docs/KANEO_UPSTREAM_REAUDIT.md`](./KANEO_UPSTREAM_REAUDIT.md)

Machine-readable extraction decisions: [`docs/KANEO_EXTRACTION_MANIFEST.json`](./KANEO_EXTRACTION_MANIFEST.json)

## Required policy for future extraction

Before any Kaneo-derived file or substantial code fragment enters WorkMesh, its implementing Issue must record:

1. the exact Kaneo commit and source path;
2. `copy`, `adapt`, or `reference` disposition;
3. the actual upstream lineage where Kaneo incorporated COSS, shadcn, Base UI, icons, or another project;
4. all required copyright and license notices;
5. the WorkMesh destination and authority-safe adapter boundary;
6. tests for the manifest's source, boundary, authority, realtime, interaction, state, dependency, and local-CI gates.

If file-level origin or license is unclear, the implementation must be independently rewritten or rejected. Kaneo fonts, logos, favicons, translations, authentication, backend, WebSocket authority, MCP implementation, permission model, and deployment topology are not authorized for extraction.

## Kaneo license text

MIT License

Copyright (c) 2024 Andrej Acevski

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Canonical upstream text: [Kaneo LICENSE at the pinned commit](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/LICENSE).

This notice does not claim that Kaneo's dependencies, registry-generated UI, fonts, icons, translations, or brand assets are covered solely by the Kaneo MIT license. Their own provenance and license terms remain mandatory.

export const agentLockRanks = [
  'agent_definitions',
  'agent_team_access',
  'delegations',
  'agent_sessions',
  'agent_session_tokens',
  'agent_installation_tokens',
  'work_items',
  'projects',
] as const

export type AgentLockStatementClass =
  | 'ranked-lock'
  | 'ranked-write'
  | 'terminal-skip-locked'

export type AgentLockStatementExemption =
  | 'SKIP_LOCKED_TERMINAL_MULTI_RANK'

export type AgentLockManifestEntry = Readonly<{
  file: string
  symbols: readonly string[]
  classes: readonly AgentLockStatementClass[]
  ranks: readonly (typeof agentLockRanks)[number][]
  order: 'authority-first' | 'single-rank' | 'terminal-claim'
  exemption?: string
}>

export type AgentLockStatementManifestEntry = Readonly<{
  statementId: string
  siteKey: string
  file: string
  owner: string
  class: Exclude<AgentLockStatementClass,'terminal-skip-locked'>
  rankSequence: readonly (typeof agentLockRanks)[number][]
  exemption?: AgentLockStatementExemption
}>

/**
 * Static ownership inventory for production SQL that can acquire a ranked
 * Agent authority/resource lock. Entries are symbol based and intentionally
 * contain no line numbers, so refactors do not churn the manifest.
 */
export const agentLockManifest: readonly AgentLockManifestEntry[] = [
  {
    file: 'packages/db/src/agent-locks.ts',
    symbols: ['lockAgentAuthorityPlan'],
    classes: ['ranked-lock'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/agent/guard.ts',
    symbols: [
      'locateAgentSessionAuthority',
      'loadAgentSessionForMutation',
      'revalidateLockedAgentSessionForMutation',
    ],
    classes: ['ranked-lock'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/agent/commands.ts',
    symbols: [
      'provisionNewSessionDelivery',
      'updateAgent',
      'revokeAgentTeamAccess',
      'revokeDelegation',
      'createDelegation',
      'createAgentSession',
      'delegateAndStartAgentSession',
      'exchangeAgentToken',
      'refreshAgentToken',
      'retrySession',
    ],
    classes: ['ranked-lock','ranked-write'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/collaboration/routes.ts',
    symbols: [
      'lockCollaborationSessionTargets',
      'lockRoomMessageAuthorityPlan',
      'authorizeActorRecipient',
      'assertSessionWrite',
      'createChild',
      'createReview',
      'acceptHandoff',
    ],
    classes: ['ranked-lock','ranked-write'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/delivery/routes.ts',
    symbols: ['artifact-upload-intents/:id/finalize'],
    classes: ['ranked-lock','ranked-write'],
    ranks: ['agent_sessions','work_items','projects'],
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/operations/routes.ts',
    symbols: [
      'projects/:id/health',
      'usage-records',
      'a2a-bindings/:id/tasks',
    ],
    classes: ['ranked-lock','ranked-write'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'packages/db/src/stage4.ts',
    symbols: ['admitLoopRun','executeAutomationAction'],
    classes: ['ranked-lock','ranked-write'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/commands.ts',
    symbols: ['updateWorkItem','deleteProject'],
    classes: ['ranked-lock','ranked-write'],
    ranks: ['work_items','projects'],
    order: 'single-rank',
  },
  {
    file: 'apps/api/src/inbox/routes.ts',
    symbols: ['loadAgentItemForUpdate','lockReplyParticipantsBeforeReservation'],
    classes: ['ranked-lock','ranked-write'],
    ranks: ['agent_sessions'],
    order: 'single-rank',
  },
  {
    file: 'apps/worker/src/artifact-uploads.ts',
    symbols: ['createArtifactUploadWorker','claim','verify','fail'],
    classes: ['ranked-lock','ranked-write','terminal-skip-locked'],
    ranks: ['work_items'],
    order: 'terminal-claim',
    exemption: 'Upload workers claim terminal upload-intent rows and only touch their bound Work Item.',
  },
  {
    file: 'apps/worker/src/automation.ts',
    symbols: ['createAutomationWorker','claimEffects','executeEffect'],
    classes: ['ranked-lock','ranked-write','terminal-skip-locked'],
    ranks: ['agent_sessions','work_items'],
    order: 'terminal-claim',
    exemption: 'Automation workers claim terminal queue rows before applying one already-admitted action.',
  },
  {
    file: 'apps/worker/src/session-lifecycle.ts',
    symbols: [
      'expireAckDeadlines',
      'reconcileHeartbeatLiveness',
      'expireStopGrace',
      'expireApprovals',
    ],
    classes: ['ranked-lock','ranked-write','terminal-skip-locked'],
    ranks: ['delegations','agent_sessions'],
    order: 'terminal-claim',
    exemption: 'Approval expiry has one explicit terminal multi-rank SKIP LOCKED statement; its owner acquires no later core rank.',
  },
  {
    file: 'apps/worker/src/retention.ts',
    symbols: ['createRetentionWorker', 'const claim = async'],
    classes: ['ranked-write','terminal-skip-locked'],
    ranks: ['agent_sessions','work_items','projects'],
    order: 'terminal-claim',
    exemption: 'Retention claims are terminal, bounded, and do not enter Agent authority mutation paths.',
  },
]

/**
 * One row per production SQL statement that directly locks or updates a
 * ranked table. statementId binds the owner/site to a normalized SQL fingerprint
 * plus an occurrence suffix, so duplicate, missing, or changed statements fail.
 */
type Rank = (typeof agentLockRanks)[number]
const statement = (
  statementId:string,
  siteKey:string,
  file:string,
  owner:string,
  statementClass:'ranked-lock'|'ranked-write',
  rankSequence:readonly Rank[],
  exemption?:AgentLockStatementExemption,
):AgentLockStatementManifestEntry => ({
  statementId,
  siteKey,
  file,
  owner,
  class:statementClass,
  rankSequence,
  ...(exemption?{exemption}:{}),
})
const lock = (
  statementId:string,
  siteKey:string,
  file:string,
  owner:string,
  rankSequence:readonly Rank[],
  exemption?:AgentLockStatementExemption,
)=>statement(statementId,siteKey,file,owner,'ranked-lock',rankSequence,exemption)
const write = (
  statementId:string,
  siteKey:string,
  file:string,
  owner:string,
  rankSequence:readonly Rank[],
  exemption?:AgentLockStatementExemption,
)=>statement(statementId,siteKey,file,owner,'ranked-write',rankSequence,exemption)

export const agentLockStatementManifest: readonly AgentLockStatementManifestEntry[] = [
  write("114:49:03ce6c288e82ca4c5e6f3ccd468377c508a2102940063d749712cf27c0ed648b#1","114:49","apps/worker/src/session-lifecycle.ts","updateSessionState",["agent_sessions"]),
  write("1046:37:9ca1b6773545a0865b46593bdcb96b257ac3816aac79bd1b54efc90529d4085c#1","1046:37","apps/api/src/agent/commands.ts","transitionState",["agent_sessions"]),
  write("1068:22:dd39d0e625ca1f120c7c6f591d07cfd6de51f88481bbbef03b10bea58e97b41d#1","1068:22","apps/api/src/operations/routes.ts","POST /api/v1/projects/:id/health",["projects"]),
  write("1068:37:a128d11b300f80bfcec2af68c108a5b505447ab0c8cc8be6c0674ce5137dc391#1","1068:37","apps/api/src/agent/commands.ts","publishPlan",["agent_sessions"]),
  lock("1079:136:2428ce784df1910913075ec04b4a26539382664c53a57654854b95bb3018c23b#1","1079:136","apps/api/src/agent/commands.ts","prompt",["agent_sessions"]),
  write("1082:37:f1d0e2905a61a2c09d93c2c36b60af32def761cba5d4ba8d316120ac72787ef2#1","1082:37","apps/api/src/agent/commands.ts","prompt",["agent_sessions"]),
  write("1090:7:32af31bb13f2eefccee15ec216c61a5d783d2378f4409ac927d604634f4a1856#1","1090:7","packages/db/src/stage4.ts","executeAutomationAction",["agent_sessions"]),
  lock("1093:106:31fa663c569e438d7f4383b5a4ac5b1e8ea66ceff2a9a8d5849ef4b4c38f1b1a#1","1093:106","apps/api/src/agent/commands.ts","signal",["agent_sessions"]),
  write("1095:37:344cfb14b41982a695734ab537aa5226a70953d8e93bf8a6b4cb0081a69c9ab8#1","1095:37","apps/api/src/agent/commands.ts","signal",["agent_sessions"]),
  write("1124:37:4906188d3e5e1f6cc7184e1ff5c3d89a022fd768fcbf661a3d052ed0e5d68294#1","1124:37","apps/api/src/agent/commands.ts","finishSession",["agent_sessions"]),
  write("1133:37:9faea33ef6a6da2ebd14625bcc023f87ed8b37986081cd389f32305f6a2934b8#1","1133:37","apps/api/src/agent/commands.ts","stopAck",["agent_sessions"]),
  write("1176:9:2ab9fe92a677fea0c751df4a40f9eb975393dd7768d56f0eec7e85a26ee280f2#1","1176:9","packages/db/src/stage4.ts","executeAutomationAction",["work_items"]),
  write("1184:9:5ee460fcc23e32c2c818eb6aff929d9746695eef83d97bd2c592ff66cbc8c4eb#1","1184:9","packages/db/src/stage4.ts","executeAutomationAction",["work_items"]),
  lock("1207:120:c582615b27244ec6808219ddcb995263c1e9321a05b09e47d22e906017d29acb#1","1207:120","apps/api/src/collaboration/routes.ts","transitionHandoff",["agent_sessions"]),
  lock("1270:251:e406104ce8c55f34190b1462573a4cbb9b006d3b6cb6a823fb90adac34e46061#1","1270:251","apps/api/src/agent/commands.ts","consumeApprovalInTx",["agent_sessions"]),
  lock("141:54:80175301e4ae912fd1609255b6bd272e3f09d91d9417b42b9c393dc8bd958f00#1","141:54","apps/worker/src/session-lifecycle.ts","expireAckDeadlines",["agent_sessions"]),
  write("1411:20:d9c253d5aaaa3430327bb1f56b387039c90ddd414aa952dde6b37da1b424aae7#1","1411:20","apps/api/src/collaboration/routes.ts","appendDelta",["agent_sessions"]),
  lock("1432:11:045825b441e727cd5e0ece54b213812433dbc996b6e35954a559b35c38238114#1","1432:11","apps/worker/src/retention.ts","cleanup",["agent_sessions"]),
  lock("1472:9:11a81931197bbef4910184e11da505f55c6db35f71c63e0a9b458ae5e204ffec#1","1472:9","apps/api/src/operations/routes.ts","POST /api/v1/usage-records",["agent_sessions"]),
  lock("1480:11:8916da692c68a6d0c42ac0206785ffecc0c6e93432f57a3d77b31b8ca5e37e85#1","1480:11","apps/api/src/operations/routes.ts","POST /api/v1/usage-records",["work_items"]),
  write("1520:11:6871e45e4745f0ed84eb2234400d1e813491ec0398fdb40a1aaa012e746effed#1","1520:11","apps/worker/src/retention.ts","cleanup",["agent_session_tokens","agent_session_tokens"]),
  write("1544:11:1bd64fe34717379028c6ff8ecfc842e3fe0c2516cc72a043d2ca639d05dd4ff1#1","1544:11","apps/worker/src/retention.ts","cleanup",["agent_installation_tokens","agent_installation_tokens"]),
  lock("1551:142:3ffc9013e850b5295518c6c242e6bd495d41ff85d4b7538887b1f7bf47059fb2#1","1551:142","apps/api/src/collaboration/routes.ts","acceptHandoff",["delegations"]),
  lock("172:9:a49bbe6a8c1095245f924f6c44afe5fcbfd50cbb91ab3338548e016df34c4f82#1","172:9","apps/worker/src/session-lifecycle.ts","reconcileHeartbeatLiveness",["agent_sessions"]),
  write("1598:42:4720e7278f7a6ab1ede2e2a344a7b77399b32db09f7897f699170e270b5a2344#1","1598:42","apps/api/src/collaboration/routes.ts","acceptHandoff",["delegations"]),
  write("202:15:debc23d0539d5035ea4e4ea136354879de3201c1e15026e45f5300f012516a82#1","202:15","apps/worker/src/session-lifecycle.ts","reconcileHeartbeatLiveness",["agent_sessions"]),
  lock("1905:9:81f5e7662e0dea67cd26da945dad70dc8b8ca146ab7589254ac3f79bd13c1c3d#1","1905:9","apps/api/src/operations/routes.ts","POST /api/v1/a2a-bindings",["agent_definitions"]),
  lock("2074:13:1daf5cb8bb0b5c943e946b7af20abe27bbd0981d3eb853f8c262260e1e0488c6#1","2074:13","apps/api/src/operations/routes.ts","POST /api/v1/a2a-bindings/:id/tasks",["agent_sessions"]),
  lock("217:7:0820123a532e7c973277e2258246630564690328a3edc2e9069d732181dc0caa#1","217:7","apps/api/src/inbox/routes.ts","assertReviewReplyAuthority",["delegations"]),
  write("2195:15:8c7ca8dbad3e6199973ae7d59038cf34a492b5538bec03d8cb96bcd9553768d0#1","2195:15","apps/api/src/operations/routes.ts","POST /api/v1/a2a-bindings/:id/tasks",["agent_sessions"]),
  write("244:13:8fdcaa5da23004d4e20d596b0533388fcb3c67d1c43ceb49c82aef4b8a189478#1","244:13","apps/worker/src/session-lifecycle.ts","reconcileHeartbeatLiveness",["agent_sessions"]),
  lock("278:54:4ebb5026435b8d3456a6e10d00a0aa472cccdbb2ea2a710ad55743ab13ddaa84#1","278:54","apps/worker/src/session-lifecycle.ts","expireStopGrace",["agent_sessions"]),
  lock("301:55:be0abdf279a1ecd6ac926c246b1df83208d40e0d8918b6290344df3bd22ec481#1","301:55","apps/worker/src/session-lifecycle.ts","expireApprovals",["agent_sessions","delegations"],"SKIP_LOCKED_TERMINAL_MULTI_RANK"),
  write("330:37:16311c7693d72bf8a0c21e076f63f0345502580622f001943a9d2959a0c83329#1","330:37","apps/api/src/agent/commands.ts","updateAgent",["agent_definitions"]),
  write("331:291:9c712d630c20629b994412bf092a913f3c77b0c42abf617adcf499dd5d86d7e5#1","331:291","apps/api/src/agent/commands.ts","updateAgent",["agent_session_tokens"]),
  write("331:52:2abe36b54a59199ca4f7b2eb1d3a9020d3909d4927c8bb917ec4a931f1fcac3d#1","331:52","apps/api/src/agent/commands.ts","updateAgent",["delegations"]),
  lock("340:61:d8e55b5195f8c5de65a7412e3578ea62baa26c01ba059fc3d5a88e5824acb881#1","340:61","apps/api/src/agent/commands.ts","rotateWebhookSecret",["agent_definitions"]),
  lock("341:25:1719c64a6d1d187fc1e36fdaa0bb1873b05c4161f441d762167dd905e9855435#1","341:25","apps/api/src/agent/commands.ts","rotateWebhookSecret",["agent_definitions"]),
  write("346:37:f13d828ae3ccf9e409a4a5e50b179210aa31a9308310e19c2d858052260e9cb0#1","346:37","apps/api/src/agent/commands.ts","rotateWebhookSecret",["agent_definitions"]),
  write("354:9:70f84fc5e7930fdcf90cb54f2577e87bcf045a01600a91f3b3bd56a3137fcf23#1","354:9","apps/api/src/operations/routes.ts","POST /api/v1/cycles/:id/carry-over",["work_items","work_items"]),
  lock("355:60:266bfe71e3154397a33775794475718c5d5d136f4f1333e38aa92d17596ba4ae#1","355:60","apps/api/src/agent/commands.ts","createWebhookEndpoint",["agent_definitions"]),
  write("357:41:3e1c941e12d1ef24d8fb9d874f1ac7de63e1078f1f16ca82d1477e0cff99f561#1","357:41","apps/api/src/agent/commands.ts","createWebhookEndpoint",["agent_definitions"]),
  lock("366:81:4e58c93dd426b746bb9a9bba32c670f2125a558278fe5aca9913922c9d5fa3dc#1","366:81","apps/api/src/agent/commands.ts","grantAgentTeamAccess",["agent_definitions"]),
  write("369:37:e9ca54c555babfad843a12f0a05ac3c1e6cd617f80647ca03c3cc67fdb16babb#1","369:37","apps/api/src/agent/commands.ts","grantAgentTeamAccess",["agent_team_access"]),
  lock("378:6:05a33529b34a7114b8abfa4bdd80bc166c4fe2a84b7d06c2be770d73a3ff8590#1","378:6","apps/api/src/inbox/routes.ts","authorizeExactReplyRecipient",["agent_definitions","agent_team_access","delegations","agent_sessions"]),
  lock("381:9:db3ef2d69b8a74d01bfa0624c6899891fd0a1b72219f2a9135ca7f6939dbdc9c#1","381:9","apps/api/src/operations/routes.ts","PATCH /api/v1/work-items/:id/cycle",["work_items"]),
  write("394:22:e3451bf7fde80d5b049a06b712675fc8e0a816e0f69fc9787b04c3e518ca9efe#1","394:22","apps/api/src/operations/routes.ts","PATCH /api/v1/work-items/:id/cycle",["work_items"]),
  write("394:37:15abe3ce09a4f91152a7f9798032707f031124a68943a9055e174c6767575df4#1","394:37","apps/api/src/agent/commands.ts","revokeAgentTeamAccess",["agent_team_access"]),
  write("399:83:26771ebf668983eae8e46c564ea3978949d42d977d00f9e716711375aee33b15#1","399:83","apps/api/src/agent/commands.ts","revokeAgentTeamAccess",["delegations"]),
  write("401:20:ed73e00751b9bf847d1797a690082c9f95fbc81513c6fa99bb64ab6135209fcc#1","401:20","apps/api/src/agent/commands.ts","revokeAgentTeamAccess",["agent_session_tokens"]),
  write("402:39:071837d3fd97e060f0c49f2e99531893f60e989d5b1a07a3ae3530e16d012e64#1","402:39","apps/api/src/agent/commands.ts","revokeAgentTeamAccess",["agent_definitions"]),
  write("434:37:a2886cbde05a4e5dffdf9e5176a94177bb3facf49917ab91da9e9a95a54ade8f#1","434:37","apps/api/src/agent/commands.ts","revokeDelegation",["delegations"]),
  write("435:20:12af2aee41d3fd91263180f962058220a8bbd9689b60827ebe6330d087134e90#1","435:20","apps/api/src/agent/commands.ts","revokeDelegation",["agent_session_tokens"]),
  lock("478:13:371463a11e059824ed4beb5aad05086019e3ed20dcc5b637380a1867ae23f83e#1","478:13","apps/api/src/commands.ts","updateProject",["projects"]),
  write("500:13:5e9d9aacc7c20fa6418212d99204b2a1008d41ec9699e81efee9f5c865bd05bb#1","500:13","apps/api/src/commands.ts","updateProject",["projects"]),
  lock("537:13:53fa34635162ed11678dcc3dae71cab6735473a9eaaad5614344ea622a98b9b7#1","537:13","apps/api/src/commands.ts","deleteProject",["projects"]),
  write("547:13:19520875bc42802ef91a269928dee15007e5b9604a52b7efb9098e14e26f3fb4#1","547:13","apps/api/src/commands.ts","deleteProject",["projects"]),
  lock("673:13:6c309c51bc2f44997b9c94b409e83dfff77aad160cfc5291a443aa1e504a18b4#1","673:13","apps/api/src/commands.ts","updateWorkItem",["work_items"]),
  write("710:13:42daa0bc96129802d53f0c12a8188c761de6c43c040094c40a2db8757e1c69f0#1","710:13","apps/api/src/commands.ts","updateWorkItem",["work_items"]),
  lock("73:7:9d0a10e9785915303eda482d80bf43fbff56ed799996f190605fd1527f9429c2#1","73:7","packages/db/src/agent-locks.ts","lockAgentAuthorityPlan",["agent_team_access"]),
  lock("753:13:177785f2a449cf9c2733e337917670ac01b4683eb85a4662844b2f2d98a751a4#1","753:13","apps/api/src/commands.ts","deleteWorkItem",["work_items"]),
  write("763:13:cfd7a876170fff92ad66617553c17f83605a52d9379678ccd6bbcd26ae300800#1","763:13","apps/api/src/commands.ts","deleteWorkItem",["work_items"]),
  write("77:111:1d6708f3933df33c551cb22b5e5551db0a0f83d7eedd4ed5acedf8a6cd2dfa05#1","77:111","apps/api/src/agent/commands.ts","event",["agent_sessions"]),
  lock("796:13:610488c292b375f245a8b94b9face23166808c396757840a11bda7744491174a#1","796:13","apps/api/src/commands.ts","createComment",["work_items"]),
  write("838:20:4443b58e6dc88c67609416b38a920c2a05a032d3502f75133787f976e8426c5c#1","838:20","apps/api/src/agent/commands.ts","exchangeAgentToken",["agent_session_tokens"]),
  write("839:20:c9348673c0c8c0bec688f07cf01688d98fef6018162487d60a58e6813ebbf23a#1","839:20","apps/api/src/agent/commands.ts","exchangeAgentToken",["agent_installation_tokens"]),
  write("881:20:77ac8893c9cfed341c0b5bd77483c0f8ed92bf56927fd748dc7709352d05f63f#1","881:20","apps/api/src/agent/commands.ts","refreshAgentToken",["agent_session_tokens"]),
  write("919:44:a9a54447680473fe30f1601b8b8a048c897242eb70193236140d2daf64ca956e#1","919:44","apps/api/src/agent/commands.ts","retrySession",["agent_sessions"]),
  lock("940:13:922dcd6232f7083d672a6ae3a7b208e9437db1c8a08fb2c56bfe5afa88e92477#1","940:13","apps/api/src/operations/routes.ts","POST /api/v1/projects/:id/health",["projects"]),
  write("940:81:fe10a428fc06c2b2c88b0d285da492e9ced0c22312f202045ce4d0787e41ae49#1","940:81","apps/api/src/agent/commands.ts","appendActivity",["agent_sessions"]),
  write("953:37:b9745b4252db8972b3787dca56704a8122a2dfded41de5e2c59bb242d698e3c2#1","953:37","apps/api/src/agent/commands.ts","acknowledge",["agent_sessions"]),
  lock("969:8:c96a42cd000fef54ccb4999d12f4b82a9483c26d8597b15d0429adcb0270cccb#1","969:8","apps/api/src/agent/commands.ts","heartbeat",["agent_sessions"]),
  write("981:7:6bf40c58b02215a3a34a6aa1a05762c8077c9fd53aed84b4bb54a37fea2c0189#1","981:7","apps/api/src/agent/commands.ts","heartbeat",["agent_sessions"]),
]

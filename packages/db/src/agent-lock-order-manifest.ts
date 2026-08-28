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
    symbols: [
      'lockAgentAuthorityPlan',
      'lockAgentAuthorityPlanWithInstallationTokenWrite',
    ],
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
      'delegateAndStartAgentSession',
      'claimWorkItem',
      'exchangeAgentToken',
      'refreshAgentToken',
      'retrySession',
    ],
    classes: ['ranked-lock','ranked-write'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/connection-installation-token.ts',
    symbols: ['reconcileConnectionInstallationToken'],
    classes: ['ranked-write'],
    ranks: ['agent_installation_tokens'],
    order: 'single-rank',
  },
  {
    file: 'apps/api/src/agent-connections.ts',
    symbols: ['registerAgentConnectionRoutes', 'resolveCoordinationIdentity'],
    classes: ['ranked-lock','ranked-write'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/worker/src/agent-connections.ts',
    symbols: ['createAgentConnectionLifecycleWorker'],
    classes: ['ranked-lock','ranked-write'],
    ranks: ['agent_definitions','agent_sessions'],
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/autonomous-control-plane.ts',
    symbols: ['registerAutonomousControlPlaneRoutes'],
    classes: ['ranked-lock'],
    ranks: ['projects'],
    order: 'single-rank',
  },
  {
    file: 'packages/db/src/agent-lifecycle.ts',
    symbols: ['reconcileAgentLifecycle'],
    classes: ['ranked-write'],
    ranks: ['agent_definitions'],
    order: 'single-rank',
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
  lock("1019:7:595723bd00a5c0a3f9132b070bdb060f63be4ab109b2cbbf3319f9a8780cacd3#1","1019:7","apps/api/src/agent-connections.ts","resolveCoordinationIdentity",["agent_definitions"]),
  write("1023:15:f994097229fe5404b38ed71ee22a5c2203302441778c7de87dc4a6ed3b9e98d1#1","1023:15","apps/api/src/agent/commands.ts","delegateAndStartAgentSession",["agent_sessions"]),
  write("1034:15:21c37a7138ec3f4aa332cb7676e742c490d21971575038848b2d7fa7c6c96e0a#1","1034:15","apps/api/src/agent/commands.ts","delegateAndStartAgentSession",["agent_session_tokens"]),
  lock("1036:7:ac7d44c6e8a43514a13dce1de22cb47d7aede4401f6f97279ef0273cbefc9ed7#1","1036:7","apps/api/src/agent-connections.ts","resolveCoordinationIdentity",["agent_team_access"]),
  lock("1059:7:1f1b0ccf2c2aba41bb9090695d54f4b2362e997b0196ee9279d8b3d0ed066e07#1","1059:7","apps/api/src/agent-connections.ts","resolveCoordinationIdentity",["delegations"]),
  write("1070:22:dd39d0e625ca1f120c7c6f591d07cfd6de51f88481bbbef03b10bea58e97b41d#1","1070:22","apps/api/src/operations/routes.ts","POST /api/v1/projects/:id/health",["projects"]),
  write("1103:13:1d0b8199bf11f03707a13b727f9b2c5e032431ffa90e62c2725484e087818108#1","1103:13","apps/api/src/agent/commands.ts","delegateAndStartAgentSession",["delegations"]),
  write("111:5:19dc785670baf3f8d92cf384686bb3d1ed07c462c29c4a1d2687e6643e7361f6#1","111:5","apps/api/src/agent-connections.ts","revokeConnectionInstallationTokens",["agent_installation_tokens"]),
  lock("1113:7:e90566d3bdc0417535f47c4f03744b82cd69697770069159f5b15cbb17fd3035#1","1113:7","apps/api/src/agent-connections.ts","resolveCoordinationIdentity",["agent_sessions"]),
  write("1188:9:d877ce877a3dd40f92f9d2588232147624c5802ce6015aaf769cd29afa391f7f#1","1188:9","apps/api/src/agent-connections.ts","resolveCoordinationIdentity",["agent_sessions"]),
  write("1215:7:32af31bb13f2eefccee15ec216c61a5d783d2378f4409ac927d604634f4a1856#1","1215:7","packages/db/src/stage4.ts","executeAutomationAction",["agent_sessions"]),
  lock("1264:120:c582615b27244ec6808219ddcb995263c1e9321a05b09e47d22e906017d29acb#1","1264:120","apps/api/src/collaboration/routes.ts","transitionHandoff",["agent_sessions"]),
  lock("1290:9:76f3cf8fb1dee030342ae2b6a85abe7b0b934c6ad9b892e9ebeb0aceb16cfc9c#1","1290:9","apps/api/src/delivery/routes.ts","POST /api/v1/projects/:id/milestones",["projects"]),
  write("1301:9:2ab9fe92a677fea0c751df4a40f9eb975393dd7768d56f0eec7e85a26ee280f2#1","1301:9","packages/db/src/stage4.ts","executeAutomationAction",["work_items"]),
  write("1309:9:5ee460fcc23e32c2c818eb6aff929d9746695eef83d97bd2c592ff66cbc8c4eb#1","1309:9","packages/db/src/stage4.ts","executeAutomationAction",["work_items"]),
  write("135:11:abc5812ef56a2dfb6ea37d73bfdde6ba33da214d8cb88cb06be4301e3d0aa280#1","135:11","apps/worker/src/agent-connections.ts","tick",["agent_sessions"]),
  lock("1388:9:1ebdb429fa5d42869396f789e068cae29dc71798121be9d621d20c076b8a1059#1","1388:9","apps/api/src/delivery/routes.ts","POST /api/v1/work-items/:id/relations",["work_items"]),
  lock("1432:11:045825b441e727cd5e0ece54b213812433dbc996b6e35954a559b35c38238114#1","1432:11","apps/worker/src/retention.ts","cleanup",["agent_sessions"]),
  lock("1474:9:11a81931197bbef4910184e11da505f55c6db35f71c63e0a9b458ae5e204ffec#1","1474:9","apps/api/src/operations/routes.ts","POST /api/v1/usage-records",["agent_sessions"]),
  write("1478:20:d9c253d5aaaa3430327bb1f56b387039c90ddd414aa952dde6b37da1b424aae7#1","1478:20","apps/api/src/collaboration/routes.ts","appendDelta",["agent_sessions"]),
  lock("1482:11:8916da692c68a6d0c42ac0206785ffecc0c6e93432f57a3d77b31b8ca5e37e85#1","1482:11","apps/api/src/operations/routes.ts","POST /api/v1/usage-records",["work_items"]),
  write("151:49:03ce6c288e82ca4c5e6f3ccd468377c508a2102940063d749712cf27c0ed648b#1","151:49","apps/worker/src/session-lifecycle.ts","updateSessionState",["agent_sessions"]),
  write("1520:11:6871e45e4745f0ed84eb2234400d1e813491ec0398fdb40a1aaa012e746effed#1","1520:11","apps/worker/src/retention.ts","cleanup",["agent_session_tokens","agent_session_tokens"]),
  write("1544:11:1bd64fe34717379028c6ff8ecfc842e3fe0c2516cc72a043d2ca639d05dd4ff1#1","1544:11","apps/worker/src/retention.ts","cleanup",["agent_installation_tokens","agent_installation_tokens"]),
  lock("162:8:ba3de6d2a4e0189158e6235d4bafadf13ce49f90287fbb2a7e40674a21dd7bec#1","162:8","apps/worker/src/agent-connections.ts","tick",["agent_definitions"]),
  lock("1620:142:3ffc9013e850b5295518c6c242e6bd495d41ff85d4b7538887b1f7bf47059fb2#1","1620:142","apps/api/src/collaboration/routes.ts","acceptHandoff",["delegations"]),
  write("1666:42:4720e7278f7a6ab1ede2e2a344a7b77399b32db09f7897f699170e270b5a2344#1","1666:42","apps/api/src/collaboration/routes.ts","acceptHandoff",["delegations"]),
  lock("167:11:42c60bd7094bef66e6f13f8159c53c596b038cf1702cb566271b3903ba709b2c#1","167:11","apps/api/src/autonomous-control-plane.ts","PUT /api/v1/approval-autonomy-policy",["projects"]),
  lock("178:54:80175301e4ae912fd1609255b6bd272e3f09d91d9417b42b9c393dc8bd958f00#1","178:54","apps/worker/src/session-lifecycle.ts","expireAckDeadlines",["agent_sessions"]),
  write("1900:11:24e00808633668b8c9f5dbf25bede8c9ba693a7ff19503d11378a806763e4b87#1","1900:11","apps/api/src/agent/commands.ts","claimWorkItem",["agent_sessions"]),
  lock("1907:9:81f5e7662e0dea67cd26da945dad70dc8b8ca146ab7589254ac3f79bd13c1c3d#1","1907:9","apps/api/src/operations/routes.ts","POST /api/v1/a2a-bindings",["agent_definitions"]),
  write("1908:11:f30946d24e92ae27c9c4d45a751b7305416e741b9cc5dd33ce4d1bada1f894b9#1","1908:11","apps/api/src/agent/commands.ts","claimWorkItem",["agent_session_tokens"]),
  lock("2077:13:1daf5cb8bb0b5c943e946b7af20abe27bbd0981d3eb853f8c262260e1e0488c6#1","2077:13","apps/api/src/operations/routes.ts","POST /api/v1/a2a-bindings/:id/tasks",["agent_sessions"]),
  lock("209:9:1f4ccfa97b6cf15228aa5cf20ff7c7142b3e3d0b0d696ab52011217ca61da50e#1","209:9","apps/worker/src/session-lifecycle.ts","reconcileHeartbeatLiveness",["agent_sessions"]),
  write("2204:15:8c7ca8dbad3e6199973ae7d59038cf34a492b5538bec03d8cb96bcd9553768d0#1","2204:15","apps/api/src/operations/routes.ts","POST /api/v1/a2a-bindings/:id/tasks",["agent_sessions"]),
  write("243:15:debc23d0539d5035ea4e4ea136354879de3201c1e15026e45f5300f012516a82#1","243:15","apps/worker/src/session-lifecycle.ts","reconcileHeartbeatLiveness",["agent_sessions"]),
  write("2532:20:4443b58e6dc88c67609416b38a920c2a05a032d3502f75133787f976e8426c5c#1","2532:20","apps/api/src/agent/commands.ts","exchangeAgentToken",["agent_session_tokens"]),
  write("2533:20:c9348673c0c8c0bec688f07cf01688d98fef6018162487d60a58e6813ebbf23a#1","2533:20","apps/api/src/agent/commands.ts","exchangeAgentToken",["agent_installation_tokens"]),
  write("2593:7:c06bea3a40a9d67a1f406cc436f5fae214febf8a0bbea2364a1537a6e9a928f7#1","2593:7","apps/api/src/agent/commands.ts","refreshAgentToken",["agent_session_tokens"]),
  lock("26:5:53efbf7e7960293836141fc1fb575d675108b82fe8f95306b7352a1dc8e92183#1","26:5","packages/db/src/agent-lifecycle.ts","reconcileAgentLifecycle",["agent_definitions"]),
  write("2663:44:a9a54447680473fe30f1601b8b8a048c897242eb70193236140d2daf64ca956e#1","2663:44","apps/api/src/agent/commands.ts","retrySession",["agent_sessions"]),
  write("2699:81:fe10a428fc06c2b2c88b0d285da492e9ced0c22312f202045ce4d0787e41ae49#1","2699:81","apps/api/src/agent/commands.ts","appendActivity",["agent_sessions"]),
  write("2712:37:b9745b4252db8972b3787dca56704a8122a2dfded41de5e2c59bb242d698e3c2#1","2712:37","apps/api/src/agent/commands.ts","acknowledge",["agent_sessions"]),
  lock("272:7:0820123a532e7c973277e2258246630564690328a3edc2e9069d732181dc0caa#1","272:7","apps/api/src/inbox/routes.ts","assertReviewReplyAuthority",["delegations"]),
  lock("2737:8:c96a42cd000fef54ccb4999d12f4b82a9483c26d8597b15d0429adcb0270cccb#1","2737:8","apps/api/src/agent/commands.ts","heartbeat",["agent_sessions"]),
  write("2749:7:6bf40c58b02215a3a34a6aa1a05762c8077c9fd53aed84b4bb54a37fea2c0189#1","2749:7","apps/api/src/agent/commands.ts","heartbeat",["agent_sessions"]),
  write("2814:37:9ca1b6773545a0865b46593bdcb96b257ac3816aac79bd1b54efc90529d4085c#1","2814:37","apps/api/src/agent/commands.ts","transitionState",["agent_sessions"]),
  write("2836:37:a128d11b300f80bfcec2af68c108a5b505447ab0c8cc8be6c0674ce5137dc391#1","2836:37","apps/api/src/agent/commands.ts","publishPlan",["agent_sessions"]),
  lock("2847:136:2428ce784df1910913075ec04b4a26539382664c53a57654854b95bb3018c23b#1","2847:136","apps/api/src/agent/commands.ts","prompt",["agent_sessions"]),
  write("285:13:8fdcaa5da23004d4e20d596b0533388fcb3c67d1c43ceb49c82aef4b8a189478#1","285:13","apps/worker/src/session-lifecycle.ts","reconcileHeartbeatLiveness",["agent_sessions"]),
  write("2850:37:f1d0e2905a61a2c09d93c2c36b60af32def761cba5d4ba8d316120ac72787ef2#1","2850:37","apps/api/src/agent/commands.ts","prompt",["agent_sessions"]),
  lock("2861:106:31fa663c569e438d7f4383b5a4ac5b1e8ea66ceff2a9a8d5849ef4b4c38f1b1a#1","2861:106","apps/api/src/agent/commands.ts","signal",["agent_sessions"]),
  write("2863:37:344cfb14b41982a695734ab537aa5226a70953d8e93bf8a6b4cb0081a69c9ab8#1","2863:37","apps/api/src/agent/commands.ts","signal",["agent_sessions"]),
  write("2893:37:4906188d3e5e1f6cc7184e1ff5c3d89a022fd768fcbf661a3d052ed0e5d68294#1","2893:37","apps/api/src/agent/commands.ts","finishSession",["agent_sessions"]),
  write("2902:37:9faea33ef6a6da2ebd14625bcc023f87ed8b37986081cd389f32305f6a2934b8#1","2902:37","apps/api/src/agent/commands.ts","stopAck",["agent_sessions"]),
  write("3011:5:99e19a05ca08107b9a39a8a671dfb6ee3f3ec05bb6545bf8f9291a5f6eee286c#1","3011:5","apps/api/src/agent/commands.ts","cancelRevokedAuthoritySessions",["agent_sessions"]),
  write("3021:5:b8f2ff630faf8ef876827d87071677165d9dd2c1d6c3cf7471126b9b2bbe5609#1","3021:5","apps/api/src/agent/commands.ts","cancelRevokedAuthoritySessions",["agent_session_tokens"]),
  lock("3184:251:e406104ce8c55f34190b1462573a4cbb9b006d3b6cb6a823fb90adac34e46061#1","3184:251","apps/api/src/agent/commands.ts","consumeApprovalInTx",["agent_sessions"]),
  lock("319:54:4ebb5026435b8d3456a6e10d00a0aa472cccdbb2ea2a710ad55743ab13ddaa84#1","319:54","apps/worker/src/session-lifecycle.ts","expireStopGrace",["agent_sessions"]),
  write("356:9:70f84fc5e7930fdcf90cb54f2577e87bcf045a01600a91f3b3bd56a3137fcf23#1","356:9","apps/api/src/operations/routes.ts","POST /api/v1/cycles/:id/carry-over",["work_items","work_items"]),
  write("37:5:469b8c3cb35ff2a9e8ae720fb2a9fa0e423b0c5f612393973365f9f61b152264#1","37:5","apps/api/src/connection-installation-token.ts","reconcileConnectionInstallationToken",["agent_installation_tokens"]),
  lock("383:9:db3ef2d69b8a74d01bfa0624c6899891fd0a1b72219f2a9135ca7f6939dbdc9c#1","383:9","apps/api/src/operations/routes.ts","PATCH /api/v1/work-items/:id/cycle",["work_items"]),
  write("396:22:e3451bf7fde80d5b049a06b712675fc8e0a816e0f69fc9787b04c3e518ca9efe#1","396:22","apps/api/src/operations/routes.ts","PATCH /api/v1/work-items/:id/cycle",["work_items"]),
  lock("429:8:46966f58940cb71118ac87e1248503f7907427971d9d7a6da4e7eb2d01505d12#1","429:8","apps/worker/src/session-lifecycle.ts","reconcileApprovalAutonomy",["agent_sessions"]),
  lock("439:6:05a33529b34a7114b8abfa4bdd80bc166c4fe2a84b7d06c2be770d73a3ff8590#1","439:6","apps/api/src/inbox/routes.ts","authorizeExactReplyRecipient",["agent_definitions","agent_team_access","delegations","agent_sessions"]),
  lock("448:9:7e7916616abc4da0703ab3993220835bc1c274a38a3dcc648d954f6559cde563#1","448:9","apps/api/src/agent-connections.ts","POST /api/v1/agent-connections",["agent_definitions"]),
  write("460:33:16311c7693d72bf8a0c21e076f63f0345502580622f001943a9d2959a0c83329#1","460:33","apps/api/src/agent/commands.ts","updateAgent",["agent_definitions"]),
  write("463:22:17cf6bbfd55ea6984432bbfcbfdd7b462dfff458542ae45134d8d7ed4db08f0d#1","463:22","apps/api/src/agent/commands.ts","updateAgent",["agent_team_access"]),
  write("464:22:d8994c8bded984f1f612bfdac2f9eda9754968434cd033a9680d5a693bc7f06f#1","464:22","apps/api/src/agent/commands.ts","updateAgent",["delegations"]),
  write("466:308:cace26dac2c07514f1087b64787e5aaa913bc165e6501c836eca42169f7acfe7#1","466:308","apps/api/src/agent/commands.ts","updateAgent",["agent_installation_tokens"]),
  write("467:22:e30fb4fa2d68eecfdbe376dba378485b29e0aa70ba996feb6e6d3e6ebf907787#1","467:22","apps/api/src/agent/commands.ts","updateAgent",["agent_installation_tokens"]),
  write("472:31:704c8b482f3bd636fd06e76c368c9784936da78adb48819cff40148c720951d4#1","472:31","apps/api/src/agent/commands.ts","updateAgent",["agent_definitions"]),
  lock("483:61:d8e55b5195f8c5de65a7412e3578ea62baa26c01ba059fc3d5a88e5824acb881#1","483:61","apps/api/src/agent/commands.ts","rotateWebhookSecret",["agent_definitions"]),
  lock("484:25:1719c64a6d1d187fc1e36fdaa0bb1873b05c4161f441d762167dd905e9855435#1","484:25","apps/api/src/agent/commands.ts","rotateWebhookSecret",["agent_definitions"]),
  write("489:37:f13d828ae3ccf9e409a4a5e50b179210aa31a9308310e19c2d858052260e9cb0#1","489:37","apps/api/src/agent/commands.ts","rotateWebhookSecret",["agent_definitions"]),
  lock("498:60:266bfe71e3154397a33775794475718c5d5d136f4f1333e38aa92d17596ba4ae#1","498:60","apps/api/src/agent/commands.ts","createWebhookEndpoint",["agent_definitions"]),
  write("500:41:3e1c941e12d1ef24d8fb9d874f1ac7de63e1078f1f16ca82d1477e0cff99f561#1","500:41","apps/api/src/agent/commands.ts","createWebhookEndpoint",["agent_definitions"]),
  lock("509:81:4e58c93dd426b746bb9a9bba32c670f2125a558278fe5aca9913922c9d5fa3dc#1","509:81","apps/api/src/agent/commands.ts","grantAgentTeamAccess",["agent_definitions"]),
  write("512:37:e9ca54c555babfad843a12f0a05ac3c1e6cd617f80647ca03c3cc67fdb16babb#1","512:37","apps/api/src/agent/commands.ts","grantAgentTeamAccess",["agent_team_access"]),
  write("537:37:15abe3ce09a4f91152a7f9798032707f031124a68943a9055e174c6767575df4#1","537:37","apps/api/src/agent/commands.ts","revokeAgentTeamAccess",["agent_team_access"]),
  write("542:83:26771ebf668983eae8e46c564ea3978949d42d977d00f9e716711375aee33b15#1","542:83","apps/api/src/agent/commands.ts","revokeAgentTeamAccess",["delegations"]),
  write("544:20:ed73e00751b9bf847d1797a690082c9f95fbc81513c6fa99bb64ab6135209fcc#1","544:20","apps/api/src/agent/commands.ts","revokeAgentTeamAccess",["agent_session_tokens"]),
  write("561:9:7be16ed81c3a6ed24ae40dd212eb0768933a13d3b9c9736b38a5144ec9d06553#1","561:9","apps/api/src/agent/commands.ts","revokeAgentTeamAccess",["agent_installation_tokens"]),
  write("570:39:071837d3fd97e060f0c49f2e99531893f60e989d5b1a07a3ae3530e16d012e64#1","570:39","apps/api/src/agent/commands.ts","revokeAgentTeamAccess",["agent_definitions"]),
  lock("575:13:371463a11e059824ed4beb5aad05086019e3ed20dcc5b637380a1867ae23f83e#1","575:13","apps/api/src/commands.ts","updateProject",["projects"]),
  write("587:24:c3eb2849278cd3a742530b6b48af803f4930895199aa67d6534a1c6c40febb25#1","587:24","apps/api/src/agent-connections.ts","PATCH /api/v1/agent-connections/:id",["delegations"]),
  write("597:13:5e9d9aacc7c20fa6418212d99204b2a1008d41ec9699e81efee9f5c865bd05bb#1","597:13","apps/api/src/commands.ts","updateProject",["projects"]),
  write("603:37:a2886cbde05a4e5dffdf9e5176a94177bb3facf49917ab91da9e9a95a54ade8f#1","603:37","apps/api/src/agent/commands.ts","revokeDelegation",["delegations"]),
  write("604:20:12af2aee41d3fd91263180f962058220a8bbd9689b60827ebe6330d087134e90#1","604:20","apps/api/src/agent/commands.ts","revokeDelegation",["agent_session_tokens"]),
  lock("613:9:071c18c8f829514456d2ccd043c24c9dfad42299e19097de2844e47b92da814c#1","613:9","apps/api/src/agent-connections.ts","DELETE /api/v1/agent-connections/:id",["agent_sessions"]),
  write("620:9:97ad748a5042ecc17a8e2c8a4dabd0e151f32c1730dc4245dbf6e3428479efb3#1","620:9","apps/api/src/agent/commands.ts","revokeDelegation",["agent_installation_tokens"]),
  lock("634:13:53fa34635162ed11678dcc3dae71cab6735473a9eaaad5614344ea622a98b9b7#1","634:13","apps/api/src/commands.ts","deleteProject",["projects"]),
  write("644:13:19520875bc42802ef91a269928dee15007e5b9604a52b7efb9098e14e26f3fb4#1","644:13","apps/api/src/commands.ts","deleteProject",["projects"]),
  write("646:9:7d5e0e06b64977d4d54287afcf4c61e151bd872abdabf0dbcc03d63e8325b81f#1","646:9","apps/api/src/agent-connections.ts","DELETE /api/v1/agent-connections/:id",["agent_sessions"]),
  write("659:9:fa3d02ee5c921c4af2e31b80fa20175bc3c27cb9ba7fd7f83fb8328557be81aa#1","659:9","apps/api/src/agent-connections.ts","DELETE /api/v1/agent-connections/:id",["agent_session_tokens"]),
  lock("673:9:fbd9c116ab6ef561b16337ef9d79ea16ebcd26950ffaffcd837e3d50645a4e41#1","673:9","apps/api/src/delivery/routes.ts","POST /api/v1/artifact-upload-intents",["work_items"]),
  write("68:5:78990fa406157cc8d99c5d989545f78a79f6ce3593edc32b2e90e3acb872c62c#1","68:5","packages/db/src/agent-lifecycle.ts","reconcileAgentLifecycle",["agent_definitions"]),
  write("687:22:2292abeccafd719abd1629d15e0f16e17d1d48c667cc44d63bc0a12b63a739f7#1","687:22","apps/api/src/agent-connections.ts","DELETE /api/v1/agent-connections/:id",["delegations"]),
  lock("782:13:6c309c51bc2f44997b9c94b409e83dfff77aad160cfc5291a443aa1e504a18b4#1","782:13","apps/api/src/commands.ts","updateWorkItem",["work_items"]),
  lock("815:9:19daec33faff942a858f114425030d13f1364209f897fee57dc6e7254880a6ae#1","815:9","apps/api/src/delivery/routes.ts","POST /api/v1/artifact-upload-intents/:id/cancel",["work_items"]),
  write("819:13:e5adeb4f3ce67762bf7bdb7381bbefcdfc801a96561bde2583114d021e467d76#1","819:13","apps/api/src/commands.ts","updateWorkItem",["work_items"]),
  lock("82:8:abf8fd2f04c3edce1f7df6ba988e86ecd4c26e3514b888e59fa63ff319d480e4#1","82:8","apps/worker/src/agent-connections.ts","tick",["agent_sessions"]),
  lock("864:13:177785f2a449cf9c2733e337917670ac01b4683eb85a4662844b2f2d98a751a4#1","864:13","apps/api/src/commands.ts","deleteWorkItem",["work_items"]),
  write("874:13:cfd7a876170fff92ad66617553c17f83605a52d9379678ccd6bbcd26ae300800#1","874:13","apps/api/src/commands.ts","deleteWorkItem",["work_items"]),
  lock("880:9:070d40456452267c46bf4d0f2e5049d753a0d71b767e1858c2b18e269ad9f193#1","880:9","apps/api/src/agent-connections.ts","POST /api/v1/agent-enrollments/redeem",["agent_definitions"]),
  lock("907:13:610488c292b375f245a8b94b9face23166808c396757840a11bda7744491174a#1","907:13","apps/api/src/commands.ts","createComment",["work_items"]),
  lock("93:7:a4dcf7b56713c211c879dac08efff86be8116c7a5f6da03a08bcee62d1839ed2#1","93:7","packages/db/src/agent-locks.ts","lockAgentAuthorityPlanWithInstallationTokenWrite",["agent_team_access"]),
  lock("942:13:922dcd6232f7083d672a6ae3a7b208e9437db1c8a08fb2c56bfe5afa88e92477#1","942:13","apps/api/src/operations/routes.ts","POST /api/v1/projects/:id/health",["projects"]),
  write("95:5:03a86871f3f61402ec61e795a50b79b3a41d20872e03479a644f65ae34c0f0da#1","95:5","apps/api/src/agent-connections.ts","expireConnectionInstallationTokens",["agent_installation_tokens"]),
  write("96:111:1d6708f3933df33c551cb22b5e5551db0a0f83d7eedd4ed5acedf8a6cd2dfa05#1","96:111","apps/api/src/agent/commands.ts","event",["agent_sessions"]),
]

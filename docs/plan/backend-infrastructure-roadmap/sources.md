# 来源、范围与完整性

## 读取基线

仓库为 `xurunxin/WorkMesh`，平台 Project 为 `DzkLDn6UW-IbfoTJzN9Ro`。
本轮读取窗口为各行 UTC 时间。看板和正文逐项读取，不是事务快照。
主线来源为本工作树只读 `git ls-remote origin refs/heads/main`，未用 `origin/main` 或 `FETCH_HEAD`。
主线与开工 HEAD 同为 `104f7afb8e89859549aa16af7a3114e90dea7f9b`。
平台 Git 缓存仍拒绝，原返回见[锁拒绝](sources/history/platform-git-refusal.md)，没有处理共享锁。
准确产品源码、合同、ADR 状态和 Git 查询回执见[源码绑定](sources/history/main-source-binding.md)。

## 授权与平台同步

[完整规格](spec.md)来自 #32 的 `Spec:` 字段。
[已确认计划](implementation-plan.md)采用[当前对话](sources/history/current-conversation.md)中
`doc:N_ON4oWLTxvM3OkjhbAok` 的完整正文，与用户本轮注入副本核对。
对话记录包含用户 `Confirm plan.`；本轮用户明确要求执行该计划。
授权只覆盖路线图文件，没有其他卡实施、更新、外发、增权或发布许可。

当前工具没有 WorkMesh Project/WorkItem/Activity 写接口、正式独审接口或 Saved plan 编辑接口。
沿 #3、F 卡及 #53 既有 Todos＋仓库例外，不虚构双轨写回或新建重复卡。
判断和限制在本对话及仓库记录；独审须走平台“AI 审核”，来源读回不代独审。

## 完整性规则

60 份工具字符串以 UTF-8 保存，另加一个文件终止 LF。
#16、#56 原返回含行尾空格，为保持空白门禁，使用可逆 JSON 行数组归档。
解码数组后用 LF 拼接，即原返回字符串；正文哈希与原工具字符串相同。
正文哈希不含归档格式或追加 LF；文件哈希按实际归档字节计算。
Spec 哈希只含 `Spec:` 后、`Saved plan:` 前的原字段。
工具截断的 Saved plan 只保存实际前缀和截断标记，不生成全文哈希。
“未返回”不等于该卡没有历史方案。
归档 blob 由 `git hash-object` 计算；暂存后另核实际 index，计算值不证明已提交。

62 个当前 Spec 均完整，16 个 Saved plan 截断。
#32 的截断返回与对话恢复的完整计划分列。
另取 #18、#53、#61 最新对话检索旧源；#18、#61 对话自身截断，#53 本次返回完整。
最新 build 对话不是旧会话全历史，不声称取得旧 #32 被截断尾部。

## 全量当前卡快照

| 卡／状态／稳定 ID | UTC 读取时间 | Spec／Saved plan | 正文 SHA-256／Spec SHA-256 | 文件 SHA-256／归档 blob |
| --- | --- | --- | --- | --- |
| [#1](sources/todos/01.md) `done` `reEr9xXt9JXN26e5SbC7Z` | 2026-10-13 10:10:22 UTC | Spec 完整／方案未返回 | `935a06094b2ac0cccc17829677d4dbd1cb067d14e2ca8cb080486fbe3121f231`<br>`c1f73193c6d84ccf287b9602bed66ce2fb53ae4c158b2eeb4584447ef41140ee` | `afa4dde86509735a0c7e4d857c4a8863929f8531a054d7b1b63c792d5d8a918b`<br>`91da0dbdf6a4ca9526b33dd7b5a9eb113759bce3` |
| [#2](sources/todos/02.md) `done` `qJKk_SAxN29AdBHERBl7u` | 2026-10-13 10:10:22 UTC | Spec 完整／方案未返回 | `d8a650c5b20f54bb01066de107a3aa9dd692fa18be0f2e08522fd01b202d97ed`<br>`6106ad5e9a1f99fc9269135e97113f9b9723fb907cf0de003281950886dc1f7f` | `cce6c49acca4775efe64c297bf6306f2a5d1ff54b6a32942c1e815ac24e5d3bb`<br>`2a97be9c00909ff8206b23d7f9eba6f124a50c78` |
| [#3](sources/todos/03.md) `done` `q_1zKPuGsG-2ZRUwOwQx4` | 2026-10-13 10:10:23 UTC | Spec 完整／方案截断前缀 | `1bd38c602ef8ad524bbf29093652472b30b0f9643790043931dd1fa07fc7c7ca`<br>`ab6bd46ed0e56c373c8ab26403af82dc5a776e4822fc3e981cab8ce137995776` | `b8cc0d350a516c648770f11d1e0e910049d86de1fcddf749cf71c4fd47a170b5`<br>`048f77b4b7c7eb35b414652363202235129d364c` |
| [#4](sources/todos/04.md) `todo` `FX01PP879WjRSp0LVcoM2` | 2026-10-13 10:10:23 UTC | Spec 完整／方案未返回 | `9bd93389964208befa90091fedc8d21f6e4bca889e40a095004ce6a3e842d7c4`<br>`dac3809c1e9c4491ae6c69ae64b6171ca9484d3ae989632d24dd0bb8eeef2822` | `5951c0ee537eefbd2a695272561a11222d09bcf798143d29e0102e6e84cb5acf`<br>`4447ec49c23b0ffe6343b42083941bf3c1450ec8` |
| [#5](sources/todos/05.md) `done` `ti53hOGbvnBNrvjXXveGO` | 2026-10-13 10:10:23 UTC | Spec 完整／方案未返回 | `b8749178cef84d87266108417a732a0fb1cccd6d3898c8609116447aecfcef47`<br>`5ae8b80b4ee1d1815650e1e54ba83464b4fe5d81a9cb1e71210def33765d4646` | `524b211f3f4638880db1813037dd50434ab2e5b5e7916b0385056d02430fde77`<br>`e382cc533577767a2ac8f0c9891cf063ba65ab9e` |
| [#6](sources/todos/06.md) `closed` `xym1i0KcnxOLi0T-hxd1j` | 2026-10-13 10:10:23 UTC | Spec 完整／方案未返回 | `897773367e57ea39b357a216ad839b14918caf0ccc3b09cd8273ea359c98c23a`<br>`eebdb7ac96fa9bf0b12346ffe7f0655f67b9b3d15c7a7dc21a39cddbe2dfbb5d` | `7a904a0eee816f0a1c6cc8bdc63240031a30cff5aa327bd71704b05097986a76`<br>`239e363226609be42a99b3425f0cd6d37e585b2d` |
| [#7](sources/todos/07.md) `done` `6EzX6xCA-_m72aQU1BEHX` | 2026-10-13 10:10:30 UTC | Spec 完整／方案截断前缀 | `6464de80cf4e62ef7c490353d4177521f7dd984ce45ad4b7e4efc45e2b838a87`<br>`cc43b9d9dab8a4eb477df45b1d6398ade9a9edaaca05329863c74da763bf7bee` | `7ea20f375a7f8c2c18b971552cca8bc71d08f81e594943d05dc84af6830a097a`<br>`a80aff406f761d80947b7aeda6537a0825a9e0ee` |
| [#8](sources/todos/08.md) `done` `Hxr1xIdh4poZp3F5laGrT` | 2026-10-13 10:10:30 UTC | Spec 完整／方案未返回 | `41bfbe35839b129c99698765ba5d266787d9332f9353d359eb97ff12b92caab9`<br>`25c6519ba7f658cb0eaa862fd411469dc28cb5c707775b1e972b5f8042685aaa` | `bcc81dcd39aa041ae06097b9e28c33ec09241097c708b28d89fc2e619c41c4ce`<br>`b1d16eb8b8560c8590bdd35c5b9a03cdd0c68ba6` |
| [#9](sources/todos/09.md) `done` `0BkezbmWV6k8vwrlSNuF_` | 2026-10-13 10:10:30 UTC | Spec 完整／方案截断前缀 | `42109d05a0be17d7f0c87900d9654c43e032b84aa23fbaf7db3780a9c9ead85b`<br>`74b810d4c482a7317d00fda3de2a9e4e5356ec8620fa2c8bf328e8a99ff8f54a` | `12620b59b1b51109c08c95d5cc0c4289e7d45fe62355e57a6435076bf0208bd6`<br>`44b3e15cb8e657ee25775a6c5eceea15c23dac93` |
| [#10](sources/todos/10.md) `done` `MPhtZiff23B33m9i2equq` | 2026-10-13 10:10:30 UTC | Spec 完整／方案未返回 | `f3e57f105b0afa822740d01cc87ed48b846a867766e88d106ff7bb5a2a2df50b`<br>`33db4295e4305add53e9775ca52192c46a802e502b46ac5292cf26d8a4f4237b` | `7c30d5f536667609672b35e7066f0acca5ef411f2b3c735dccdb8228e10d45d5`<br>`578abcdd3768ec3e628b4857f4f1c5f2aab6a99f` |
| [#11](sources/todos/11.md) `done` `IJQA_DfxU0hF5e8L5Xb3v` | 2026-10-13 10:10:30 UTC | Spec 完整／方案截断前缀 | `3f61d8b70b055897e0e4129a33f688ad715fe7cbe6b85583f32369c67334e784`<br>`89e33f124e9e8bf968d47fd46cd8f3239dd66ef9e048aab33ed52e58cde97f6b` | `b423026e411047625d1a1d2ceebd80b1d504142a01da5e5170da72fd6cba3297`<br>`f4745e8ea995e27cb3abfc0622c2fc388040d1f8` |
| [#12](sources/todos/12.md) `closed` `MRdRKNdufZ2cFEv3hwaf7` | 2026-10-13 10:10:30 UTC | Spec 完整／方案未返回 | `7fc1dc1dcc38e54294532a88b99aed5fada8668d0e749fde36731b16212640cb`<br>`59af74770cae35e70e14b560b37a6179f9557355b96e5865f7dea0446be5009a` | `325d1c6d86fa43a22426bc531d921b09dd3d4c421d6a90987bbeb3c9e032be83`<br>`fbd3028b2c8f4359e37f07c146a5a3cad9db1738` |
| [#13](sources/todos/13.md) `closed` `O2iz8mb_26RoIlnpfXwxV` | 2026-10-13 10:10:34 UTC | Spec 完整／方案未返回 | `679cc19d6d7a480d549e9fe919751a826a3697d2743c3ac7154950e51ffbea05`<br>`5878c0255fdfc03b3b24b40dd1b21ff45803f83dfef64e159e386e1a903a080a` | `02a46767cc066cf8410cf7d0189bf167f0226f9583ee124afb026ec95beef7ac`<br>`797fc12fe0b7baafe319d194ea169bb4541a06d9` |
| [#14](sources/todos/14.md) `closed` `YLnrl8RaxiZjEjsVQ80B2` | 2026-10-13 10:10:34 UTC | Spec 完整／方案未返回 | `62da99bda7de681f4a5e2ae9d8042435b9a5aeaa935f10d93043300c6d135bac`<br>`9cb8e6d01bdb2d9792198b4d4f5327ff5cb02eee5555bc819d594b269e4250bd` | `dcaa553446d45457c590996c22620bc7b7d2215e8dd9c63363bfe4f34d89560f`<br>`713816721e66a44044b6fb046873be83f9a333d1` |
| [#15](sources/todos/15.md) `done` `kkG9VeT3_uTzREhjnX2ve` | 2026-10-13 10:10:34 UTC | Spec 完整／方案截断前缀 | `0daac434f1924dad9abd40749196d3d182e3d0ca2dbda5273ca0d6278a37a133`<br>`b9ca5bb519b4f820334c78d80b0cc9667052424d25ddda1ef9843a3a408e924e` | `464aafb48dc24aed3e21f69e843b40c45240d6155455ea8c8c2671c62d3bff37`<br>`31bc02aefb8aaa019a10f076136bb0375cc570d3` |
| [#16](sources/todos/16.md) `done` `kjOs4t_DtMyrkHTBFmpQ5` | 2026-10-13 10:10:34 UTC | Spec 完整／方案截断前缀 | `4bd38e9ad783a2a10a26a7f66a8dcf2abdaecb2e2e2b4db6b3e39580b76a5a42`<br>`5203d84061b0b4d654fcec69f6d73839d75d941e7a6e56589b4a5f5cf17aaa76` | `692bd7821610e1fcd017ab8392b030e0f618cc1ed18a12b6a7a590576de7651c`<br>`a49cd34fb42dfd0ba30d192faa8808a9b72db843` |
| [#17](sources/todos/17.md) `done` `4DlyrPrDMMtK5JTmFm1t_` | 2026-10-13 10:10:34 UTC | Spec 完整／方案完整返回 | `34750910ac9c2fb87c6bd1585d554feefb75cc0f3699345eb80efc989773c7d1`<br>`9a9a5852d1fd1e8d66bec9a3f1a346f1e7e9d665838519926ce07ad7d8bc61b6` | `cee5a1bbb6c74b68d3a32249bf3f0323903f0d171e03d8e0ee52c2cfcf182eb3`<br>`d4f53cd1715872d4e43a4b97a01498014038425e` |
| [#18](sources/todos/18.md) `done` `Tws50k02Pi52R-RJEXP_N` | 2026-10-13 10:10:34 UTC | Spec 完整／方案未返回 | `e96c29f5241e0f8322d6c11a68f11056ea5445c43f678f75cd5526dbd3ca230e`<br>`31e96f39e313e25d9304ed7cd8a5e3036cab5b38d44ec77b09f9242bc535fce9` | `bd783461f845c6ab2f302e424700448c0ecc5b16f74db80c2ceab5908cdd248e`<br>`c7fed98300fc91046a1c6bd89af24170cdecc111` |
| [#19](sources/todos/19.md) `done` `cPwwV-W_Lkm9DtiQWifXP` | 2026-10-13 10:10:38 UTC | Spec 完整／方案未返回 | `41309ee4027a59fcb8b6651e974f8d5ebefba0572139f67e31f1290dd13883f1`<br>`83ee2e178dfeb39533c46a621d46321b3d21de59eb00cbe72d528af897d41874` | `fed9d8afb4df3ca9dc678e8b183e21594689f1827802f01acd742671b62c4bb2`<br>`8cb1a585acdcbe91945991c940cbd459fa2a3a54` |
| [#20](sources/todos/20.md) `done` `JfGwKk3prfIie6X2u2J51` | 2026-10-13 10:10:38 UTC | Spec 完整／方案截断前缀 | `a654cd7402b251d5e3c99107ccf680fcae3b9c2b64876ae5378a0534b9c79a62`<br>`937f333b5266789f0665accea50b0953b778a6a82644e432035fb27ef8365e94` | `3cdfb8a631b71a71e4fbf4d13ef3c3a51c67fd620b23b7b7ee72c99750d53204`<br>`6446531df14349eda8d6a2af43c1d48308f0938f` |
| [#21](sources/todos/21.md) `closed` `2j2sxT5wJ-l001efH_meJ` | 2026-10-13 10:10:38 UTC | Spec 完整／方案未返回 | `b8f492f81c95a41fe578da9eeedb2d5db822c4bd6e845cf1e4e174ac68d8d07e`<br>`5e71b93f3b643c8205f9c6b464234075fee34417f9ff815cc1bdea234efb25ca` | `93a17e71785c3a095ec47493260e6ab6074e9c7ea4a06034697808e879cf79d3`<br>`4bb9a96d18ced6b453f339f422557283b41a69e5` |
| [#22](sources/todos/22.md) `closed` `gY4n2fZhVLa9FcazFC_bY` | 2026-10-13 10:10:38 UTC | Spec 完整／方案未返回 | `22e1e996402c4dfc9ab2b2adfa23e0c91fb95222fa19af0ae1a2e9f4b13ef919`<br>`17cc047d6a4ab224275755d1a475dc0c84c34903c016ec1b2489da8162bfc6e7` | `02f7b0a5220cf1442e017535022707bbfa136f8e2d054744789dd8acdad50edb`<br>`6b0b1b3733b8af590301dbc89b22a4b2253ed241` |
| [#23](sources/todos/23.md) `todo` `hHvBuVEpXQRQhVB12wRgu` | 2026-10-13 10:10:38 UTC | Spec 完整／方案未返回 | `9c48a40a9dd5779b7bd5002dd0035d1bab363fa8c85a348f265b71d008077b3c`<br>`967298ff0257f70594df6320340a31633b1036b1868d479d06a17490f7983c39` | `11a80fa2e0452a06fe998a1f49353e3ecb37f13b201fd0fa2336b7eba7816142`<br>`e5503b924dd6a9b8bbc895a78f272fd01f58d589` |
| [#24](sources/todos/24.md) `todo` `UQPSqKNzHK_mRc_1wOxBA` | 2026-10-13 10:10:38 UTC | Spec 完整／方案未返回 | `a3ed80fa75550ac8e16376a526844d3a4d7d43659862d3682f095022ed17d45b`<br>`dcb5ff1a1fcf05497a6e531651f510bd5e24f2f3180d7957e38c101bd88c4d91` | `1fe1ca48faaa51552057310b1840f966a1a494d2dda8ab64b2321b09e5336d3c`<br>`92f2bb8fedc3e987302569d561f7fdfa3c077adb` |
| [#25](sources/todos/25.md) `todo` `edIZ0ybOGMRBI6aupNUhU` | 2026-10-13 10:10:42 UTC | Spec 完整／方案未返回 | `1303cfb2f481e8ea3c4ba607fad989ff6d5219659c5993796a6e32024d281e70`<br>`27fa1e98a7774430a1e47fb2d28d3677691c071e7403d938d399d507be6a1d4f` | `0a01ed4ea6f0c414f423740806907ede5d26984cba0722b0c91de03ea65e463d`<br>`cfe7996727446ef7491965ae70406a8ce27c29fc` |
| [#26](sources/todos/26.md) `todo` `GKJOdaKtOjiTwP637pyM-` | 2026-10-13 10:10:42 UTC | Spec 完整／方案未返回 | `d17c4e1d788b0829b8a27c66045c016cfa121ad81cc277bcec0e6d7e3df9bd99`<br>`ed6446d6baa165478baa1fb3c461c732673878d22c7bd3937d2d0bad24167490` | `5ccce270823bb84ee6eb3179432ab389d37ff0f3e8cdbb170f1d98a9bc0702b8`<br>`cc2bc4c3f30ccdab476972d86edc53db09f0c205` |
| [#27](sources/todos/27.md) `todo` `89f9yFnmIg4nszXIBCByh` | 2026-10-13 10:10:42 UTC | Spec 完整／方案未返回 | `c9069362c3f65b2139f831e7e7a3c44639b38e5df386ada8a1dcddf240058c19`<br>`ddfe0131fd0395791e78687fb00b00369ec33e4626d08a564bca190da1c24228` | `73fc6c961dea76725c12d3aaa4ab47e3ec43ee2feb9b23ebbe26038c71b25f56`<br>`b8242c87d5c753fcacaed8ffbb45d73982a41bbc` |
| [#28](sources/todos/28.md) `todo` `YtFHUCHv8l4JZcYd1qHAU` | 2026-10-13 10:10:42 UTC | Spec 完整／方案未返回 | `27bf3741e297ad9fdbd1df68a8d7726a03d1cbb5f521fc931c21a4940ba9e4b0`<br>`d6972bb7ef405b20daf9cb7f5467609ed0eb6c5130ac680ec8d27fa0ea3b053f` | `e42a880eb30931b409959e1958602771f8158b30723f301bd369553277bf7a8d`<br>`f09bb2561751b13a88e9d12d17d8a93b35303de8` |
| [#29](sources/todos/29.md) `todo` `RTVGtGBgj-BvazLLjiXKu` | 2026-10-13 10:10:42 UTC | Spec 完整／方案未返回 | `cd1fbaff3c7ec2f694f8fa5059ae79449452d4ecbe24bf239635ca30f6e299c6`<br>`21c84e0f6ebf5cf5c616051a5dd0cde4d4349ef796c78f0393cc9adc40e1bee7` | `24174496d1f98a0ac6cb675d24249f6488c1576a4eedddc2f3028dd72a83e422`<br>`cb872fc7290bb52f2c2c981b9d9d3fc0a1356be3` |
| [#30](sources/todos/30.md) `closed` `XDF5OrRknA0lpitUup9A7` | 2026-10-13 10:10:42 UTC | Spec 完整／方案未返回 | `cb128d699cab80376c8c6b89e6b1f5a176e77cf4604cbbd03cb978d1fbd5f6c0`<br>`8629a2e7d8cfa5ffb939177faad9d08558f8c2560873563126f4241742d52465` | `77330969e41ff90b4f1e07218300784e692f4d48f345e142eda0da4f17c1ba43`<br>`174b9e26e4a6a9b081d85c6184f7aff55f0c8c25` |
| [#31](sources/todos/31.md) `done` `g3z2_7RkMHTIKvp_tRd1F` | 2026-10-13 10:10:46 UTC | Spec 完整／方案未返回 | `2f6f63486415c808f3e9bed1e9b18f3dce5254f1d2c8e5cd0fd6439038832244`<br>`d04e5518b344731cc1398c496092c0711907336360cafaeeb4ecce728a0a5565` | `b4414e4ea6270ad9f2f9f73cb11db9148f77999d65e1fca7dc9da65544949cd0`<br>`969d63fd24cb40689026edcde6317f11a94137f0` |
| [#32](sources/todos/32.md) `building` `npcqX1i7vai8HivE61gCn` | 2026-10-13 10:10:46 UTC | Spec 完整／方案截断前缀 | `15eed4815a02331c37b80f84c6cb15687b449c5ef1666510a806d66f8516ad6c`<br>`acaac8280555e049c460acd09244f13613c05b3fc46a2efd045474f52cdc9628` | `eb42cad7d0cf82e62b68be938d4ee30d6d1d5a5bb5b4f5242670670db0061bc5`<br>`2d9a37bc82276cd7af349fffd68858ef9d01d721` |
| [#33](sources/todos/33.md) `todo` `zTp9s5nPMWiUfQ9Ju1TB_` | 2026-10-13 10:10:46 UTC | Spec 完整／方案未返回 | `9e8fd26750df6c25cc02f91ed238f68ea9baabbb12b80d8714d2588a8c777955`<br>`383ece480ae9af80f979b56122b2bce6d1670f637df92030ebc5d6975a93af22` | `298cfa9f52dc8ddf28d57c9910624afb6e0bf696d75f926da9572be78fd68f0c`<br>`a5bde32bdf5175ea4e316e9f849e21451bc536aa` |
| [#34](sources/todos/34.md) `todo` `_ac4c_0tJUQUw0VpQZwHg` | 2026-10-13 10:10:46 UTC | Spec 完整／方案未返回 | `8a0650ef9dddd570aeea028a9e192fa25130d4bdb8a09d2fdaa711dafe5b1698`<br>`673aa4825155171d5c0a8ac95294c9746fef3d487c3c93a38cfef801eaf40584` | `5795e7c3df2c16258340369e61807594d4e058a9c3382be82cec020dd97ab9b9`<br>`8d75c42af3eaba18a6cbf815d64467aff54a31ed` |
| [#35](sources/todos/35.md) `todo` `RV7tsdWJpr7m2nJyv9nqR` | 2026-10-13 10:10:46 UTC | Spec 完整／方案未返回 | `1883574d409064b0051420284acf78eee0bfcd7066f2a3b5a454f7bc25c822e9`<br>`0570044f78acf10b5d580bc8206320ee58822340c1475a9a1f6ad73cd7101277` | `f9260e52aaa7bc6915a489e23e37e24dd932320e704377ed139261507f40f81b`<br>`010a5484f82310a76a07785dac437e7d5c84aa44` |
| [#36](sources/todos/36.md) `todo` `zMA4ndl8GbMiBKUGkVGCM` | 2026-10-13 10:10:46 UTC | Spec 完整／方案未返回 | `5e3565e499170062c6d240ecad986ef31252dbc8b104a655b46dafb4fd037996`<br>`f404cc374e372a2c6afc54bc0b4648062f208120890779df923e32cd2c92d316` | `5600ac3039687278fd529a085ec8cee4464d81c4893a84fca11b3351903fa733`<br>`0e1614765c93abb4383b0bb8a1f6bbb9b80607d7` |
| [#37](sources/todos/37.md) `todo` `kRG30rKJKzHIJgViP0zG9` | 2026-10-13 10:10:49 UTC | Spec 完整／方案未返回 | `eb374e18913ed7718aa7739f8ae06df9d11c92acd98c02699c06f225bd73839c`<br>`c4994fdc68e7b88380a54f5ba735a051e2281354c22b4749489b18f0033cbe73` | `3c76d6a1ef2fb612c160ca001c74493701f87aab6daf9bf852b33e9191448743`<br>`7c6f18fd9e8e4738bce43141641b4bd740db8963` |
| [#38](sources/todos/38.md) `todo` `JSrBIuzweE0xbwHiRv6mg` | 2026-10-13 10:10:49 UTC | Spec 完整／方案未返回 | `96ff522491409890e6aac44c59a0751880006d525cf2d3a7d0b6cf0221d6a9aa`<br>`ce621203973df7e33afd75b83c8bf2e857a973ce7de251c283160965bd701d50` | `42c4f579f2166b415be3cdc9f6bf77dfc1903dc29066d6601652fdabadeea3de`<br>`9996d02f7cb34e2c38c8048579626d8073181c32` |
| [#39](sources/todos/39.md) `todo` `XMPk98TpHKV-PATSa73Ou` | 2026-10-13 10:10:49 UTC | Spec 完整／方案未返回 | `9f52dcca37a3bca61e78611766025c94ed2e3f22786a3c87dd5b180ba62ab3e0`<br>`43f4662cefd83acf09568eca7c8b5ca0809f47bf596df7c2973ce2e3c87e00dc` | `1753fd8fc3a5a26a7494f912e4aa4705a4b41a17db02ad3935e7e3183fbf583b`<br>`00dd228dd9c55a0f6c7f24effd0ba26f7ee772ca` |
| [#40](sources/todos/40.md) `todo` `lWvlZxnqQ2iv7pO6CcR0i` | 2026-10-13 10:10:49 UTC | Spec 完整／方案未返回 | `5ee50a5c641a81fac519c87f0fc44bc7b8649ab5248f96b2b3c29a952e7d475d`<br>`7a778b02279c5a7472e97b8541e53e2256ccde8080500c50f0c16b3bd6a73bf6` | `5e75331562648fe0c95601c769a76483be0aa98b7ebc849fbd8946ad344244a2`<br>`fff37bda1961f772c277d5202588d3afc7322e16` |
| [#41](sources/todos/41.md) `todo` `_dNeLJHtlGTC0GLyGqPXT` | 2026-10-13 10:10:49 UTC | Spec 完整／方案未返回 | `b8edd5f2fff0333dddb7fe1116cfd3f3ef351d736eabd0430d6b4c0006dcd61c`<br>`97bf44dbf895a3e435ca09caac8b21aa0d2dd3c50aa1d2f67cd401360ed95d8d` | `45e96e68b86c0b336fe583b669d1f7fd813ececfae537538afdf41fbcc40d7b3`<br>`e9316422091b625b05d400e3ea0e94c697d2e404` |
| [#42](sources/todos/42.md) `todo` `MC5STj7Q-EsuofkAYn8zW` | 2026-10-13 10:10:49 UTC | Spec 完整／方案未返回 | `e44ac3eeb5988017baae3a8975d15526f41784449bd82fe74a25ce213430835c`<br>`f1a9c4538e65807f59df0cd1933491697bc2547bfdd176554f1d217351f72212` | `8cd45d48f533d93596b14c4167e48b0550b938df24c87b68018952d28431aa63`<br>`ddb3d6b39a5d0e9476d071dfb7bbea30af0c4688` |
| [#43](sources/todos/43.md) `todo` `DHwpmz2ar59DF-6StD_pC` | 2026-10-13 10:10:53 UTC | Spec 完整／方案未返回 | `dad4d23c3853be1731601631428178f98e44a4fc9b5c93f660427628899d4ca8`<br>`e5b958b470aaaa610a6c93513101d8f914056ddf81227d660e992d1553f7965c` | `c9d549a038be0d77764c4f89ecaf96ce8e238d68218f133b94ee9e289cbf5086`<br>`27705d2d52a996dc62339e17737655f438d94391` |
| [#44](sources/todos/44.md) `todo` `JIdLcnMp1BqD3AWhMTDI4` | 2026-10-13 10:10:53 UTC | Spec 完整／方案未返回 | `c40af5b44a2058bf64fe2074cd907fc58f54f0e32370b01fcb3588ac27762b90`<br>`3db775ae808fa153c439e3d8d7285f56a88267ded3ce47ef1f9535ecaf381b40` | `57a21b5e1bf4b0d703ab8f86b2d143f2c7209a09767777216f16b4de80598542`<br>`71622912144128d55e7ba37635a0129451fe8d51` |
| [#45](sources/todos/45.md) `todo` `lMa3hSLBuGfOfo4OabuP_` | 2026-10-13 10:10:53 UTC | Spec 完整／方案未返回 | `80ae930dd546ea2712607ae757e444ebddab420d4d1f8f83b8edf054114e86f9`<br>`1f897b056bba8a7048a70ce0493de749776d9e92a28c061cdfd34f9ecaf9c026` | `bd84b387a9569d979f736131919f05e3ab774731aa8a851bb2d9375f0c0b8014`<br>`fcee7948cd7cd6c06bc237bb46896e1a75572509` |
| [#46](sources/todos/46.md) `todo` `OvaPkm5SFS9vjgHkT3cdf` | 2026-10-13 10:10:53 UTC | Spec 完整／方案未返回 | `b02f1087a6089aa72a66a3930653d8ba7552a4dcc8f71084c89c29a3aef842c3`<br>`bda61ca7337f13e30b5b46179a1989de6573a5d6ae2e048b83add8e9742f4487` | `ed857d97e5fe6640fb3d959512d0065d9ede51d749e929cb0d0ced7a121ea361`<br>`ebd5f83721b7703b5d18b5c3dc464e7983616e91` |
| [#47](sources/todos/47.md) `todo` `4ptxymMDb7DC8b1PrWD-E` | 2026-10-13 10:10:53 UTC | Spec 完整／方案未返回 | `b36241ee1fcd996f0eaf73f7c63c04c1e028dcd1e0c421a9d4546caf11ebb5e6`<br>`af9f20952215db738dfb466c4512dbb0c5c8dbe12b80953540c579a0c0319abc` | `d5d9a7c9b93a979b15a531bbcee7b4e2097a01549303eb683edd661cf1f378e1`<br>`8324eed3602e325502f00cc8d7d16593c81677c8` |
| [#48](sources/todos/48.md) `todo` `2PTT2HTip1ZINl8wkzZVt` | 2026-10-13 10:10:53 UTC | Spec 完整／方案未返回 | `8a01927a171ce0661b9106d5ea92cbc7e3545cbd5abfa1cc02432afb90b23a89`<br>`15abaf34bb84899c114904a14898ea19fcb12b5f0d04a4dd0cd380033d0291d7` | `07461ac0c8ad227bde587e3552c94107d2ba188137db551a2c799de0f633b14a`<br>`ad9f693aacf8207b1f9819daa71dc852183c5205` |
| [#49](sources/todos/49.md) `todo` `aRkCvNmh7KfPhK5XYsvdn` | 2026-10-13 10:11:01 UTC | Spec 完整／方案未返回 | `e3011ac4df584c7458ee83c1d2611d8bde02cd7c8f14d0f86490e85510870ec3`<br>`935962b027b9fd5c9542d6b520ec2f0a2e71f1f2e6d94ac106c5a3ca93057846` | `cf239ea392bfb4a31f44ff9c5d16d1b5ee4dace469859e3dc34985699441362e`<br>`5d0bb26d7f5819b650f486f0054f420410e97432` |
| [#50](sources/todos/50.md) `todo` `KyWJA_B67Q0199sK7VnTh` | 2026-10-13 10:11:01 UTC | Spec 完整／方案未返回 | `5c7a49754ca997690f311eed9ac65b570e94871e3274ea4cb03edc5367351daa`<br>`91cbfdae6a94080e10c405edb57e4776ebfa94a2b39054616444c2f87d46964c` | `1f9da881e2591d326c833cdbd6165156bfa53559df3d16addefd40d86824ea11`<br>`0e4f83e37cc3b96386fd807caa561168f54798a4` |
| [#51](sources/todos/51.md) `todo` `Yzn_YDQ55aKdtijocMDnZ` | 2026-10-13 10:11:01 UTC | Spec 完整／方案未返回 | `280f1e20f030091ce424f2b56c4fb58137f49a57031378cca26ed2ae789b112e`<br>`2eb10ed83aac6b95ce01177da19409b62c47c831de6ef51cbf4fe9f7ee1ad2ca` | `11fd581e890c40ceddb282ea6d62b5ea62747fab9896c6d6e24c7cd7ec0f770f`<br>`d8f3ba4f17b0cea1b783276412ba724863484e9c` |
| [#52](sources/todos/52.md) `done` `6LZdc1ZhadjkkYSzEi6zB` | 2026-10-13 10:11:01 UTC | Spec 完整／方案未返回 | `0c6715254ad07fdbd0143ab92317369624f1152433588218efb4a0a73ca965aa`<br>`348d1fe1efeb3f13d4fb72d23bdb17947e784997bc7154564ee2ab8e32e43d4b` | `9423a38ee5ba08b407d9c498436a6299491baa13ef489371e88dc8ebeb2ff34f`<br>`b7a922616e20a91f8b653c0685513d26ff037ad4` |
| [#53](sources/todos/53.md) `done` `c2myb8a18ksdT50jkJnb8` | 2026-10-13 10:11:01 UTC | Spec 完整／方案未返回 | `1fad6c533cd439d0fc8fc2a9ad90e5f86dc36eb30a54f26efb440a496848417e`<br>`b2e7540512ccd5d3be5143cb53c193223ea71616f116435e7ec4c2b80b252a91` | `91aee07337736da35f7e16839b374f9b8af9d6fc90c037fddaf46034196a21f6`<br>`f79ca0ab75910da24a0b0bfd31477d371ffff2b0` |
| [#54](sources/todos/54.md) `done` `pMO6s_SmEL_d81kjKm6S1` | 2026-10-13 10:11:01 UTC | Spec 完整／方案截断前缀 | `14e5ef347daaa39379a0d5454906735b930404eab8afa6d916f72c756f54e4a5`<br>`d541f53fbe3ca634700c68ca8031650d888608ec168ac6261db4df32256b93d3` | `b191af306dce43d29d6e8018a1342a7ca81f321c1cd23beb5006dcf2de5ad145`<br>`0e8d9a1d4016374feb508f16556b1b7ab9fd41ca` |
| [#55](sources/todos/55.md) `done` `WZQPIqZlFUUCVJ0-706Wn` | 2026-10-13 10:11:07 UTC | Spec 完整／方案截断前缀 | `e50ac882fa9c00d31168d9485d2b08e77719819ac00496cf0dca47c859874851`<br>`2fd00094fafdd56df8382b70d190a67544441734de9c474c64836ef066d675d3` | `b11d05f1a81fa616098799f48c4c16687f9cd80546150e173d4df947bf3d7fbe`<br>`488eb46e563232468e5becf01ff715c6d4972183` |
| [#56](sources/todos/56.md) `done` `AY-kl26cRVICuFRT6uzSe` | 2026-10-13 10:11:07 UTC | Spec 完整／方案截断前缀 | `ff719d326a2788c72cab01ce7f2db16c9b52bf5ce4dbb53657ab87376b56536e`<br>`d3ee520e5a2290e38e35bde7bbb4d62d209eaedce4d1430bf705e91b2aa2aa4c` | `8b301ff6c4ed0043d91c2a815ac8e0798b71b5a8b0d6024d2568cd4f99a6a819`<br>`8875478d394cc62cd3646c4fca9e282f30559e3f` |
| [#57](sources/todos/57.md) `done` `g0q8D1msrOVY2kg-cSdkj` | 2026-10-13 10:11:07 UTC | Spec 完整／方案截断前缀 | `5ac0e78e4dcc6ad79b0ca8a9ece4b7227ff80bb836a224eb57726e4a4bbf4d15`<br>`dc4e1d8e22e68a8725a30372376b566407034014ace47fff3c174873ed3235e3` | `ed956ed620884bae778a654a3fa0c94bde268edd76b6f1d5ecd9bf5f6a836de0`<br>`832a57229708cdbac25580a4a4446b36500ad352` |
| [#58](sources/todos/58.md) `done` `OHtiaCWGLuE1ZKuaYcslS` | 2026-10-13 10:11:07 UTC | Spec 完整／方案截断前缀 | `9500689cabc72ba3af1e5bbe6740fd8b068ec1d4ad16b41cebf63b94b64817c2`<br>`b6147ab07c7a17f753ff155f3a583664621b44ad303a1e09529a9df75f09b19e` | `cff473e1560b07cec5aedf60c566088f464ff7860d1f88105348ff1d50265c62`<br>`78b78275145373174c9597762b9976f254284617` |
| [#59](sources/todos/59.md) `done` `iCMNjXqZQLp65ZUMZg0nr` | 2026-10-13 10:11:07 UTC | Spec 完整／方案截断前缀 | `068a02e85dafff449ce6fcd5234c6e68af9726d7a82c1b0ee5d86e9f541bc35c`<br>`d73febe97de73a3b4e003d5b5f26155a43da8b1eb52053da4715dc76fd515405` | `3a883549dfe56168688f4577d7f3762319f4fa72ae3a0fac28819408d1b5232b`<br>`3cd7078ef58939a5cb78fbe77262a3da3291e20a` |
| [#60](sources/todos/60.md) `done` `mfKRDbW2TwlSuLxBxCoU-` | 2026-10-13 10:11:07 UTC | Spec 完整／方案未返回 | `95c023b0947c6a3cc000dfd986b0ec2be8e27614734b497cc62b92a9a90681b9`<br>`ff8e5ff69c63aac57bf5b315997b074afc3b699730b3278c1af6f87e0de1b335` | `54da5d9d55672077cbaab331bf02bc6b7aa228922d9f0a5c2e67f8e8a680c458`<br>`b94c44fb3837c96c620ab08c36602c29d053e694` |
| [#61](sources/todos/61.md) `done` `G9grPMcWhjVMFaEcNoVAG` | 2026-10-13 10:11:12 UTC | Spec 完整／方案截断前缀 | `058080bfe626e230edd5b4915430550cf521789844138b429b975f4675264e14`<br>`f9c6d43ded9edde5a70137b678831acff1dbd00ffc24ef6c3bd99b6af1e88d84` | `21ece2d175fe44ac73220ebc6509c6c00047b27907b77047e16de3d88c40522f`<br>`0f14601b35dde68bdc77a0e368f8b22ca270e62e` |
| [#62](sources/todos/62.md) `done` `CmdFbMAsJnmQGBhXakJ7u` | 2026-10-13 10:11:12 UTC | Spec 完整／方案未返回 | `9aa27f45db0bf22e02d656a09c69bff8cb71eb2c012f1867189bb1498962031a`<br>`c55629f7640f617d165edd523dbcc79004b80ff894e1baf933a54179d142eb34` | `71a8a478a185aa959076a95e5263e15756072689053d5be8bbbf7768caaa3a31`<br>`aaff06609aa4752f071d15bb3feb99ed1dea264b` |

## 主线历史原件

副本从准确主线 Git blob 取出，原字节、旧措辞、首败及当时状态保持。
副本相对链接仍属于原目录，查证请用“主线原位置”。
旧报告“待合入”描述是当时事实，当前卡 Done 与主线可达性另核。

| 归档原件 | 主线原位置 | 字节数／SHA-256／主线 blob |
| --- | --- | --- |
| [sources/history/repository-01.md](sources/history/repository-01.md) | [docs/plan/backend-agent-mcp-priority/README.md](../../../docs/plan/backend-agent-mcp-priority/README.md) | 9139<br>`b156d436c2222adca9ad25ab0d9224b0388b278bc58743d294c803e7961209a1`<br>`95d56c599bcb9ea20e1ce7105deb694e54fff4e0` |
| [sources/history/repository-02.md](sources/history/repository-02.md) | [docs/plan/backend-agent-mcp-priority/coverage-matrix.md](../../../docs/plan/backend-agent-mcp-priority/coverage-matrix.md) | 26429<br>`34d6527d056df873b33cd3e5344e7b9f5fa8698db59665fa455627a79c751fd2`<br>`0d2ab85cc22e398d95751ffbeea30b26a7f69dc0` |
| [sources/history/repository-03.md](sources/history/repository-03.md) | [docs/plan/backend-agent-mcp-priority/sources.md](../../../docs/plan/backend-agent-mcp-priority/sources.md) | 50119<br>`e029c6fc747e896516c91cb7285fa6cc4cf9cce4265bd589c405fff9355145a1`<br>`615ddaf879cbe1894c13c781d8a5243fa4d69582` |
| [sources/history/repository-04.md](sources/history/repository-04.md) | [docs/plan/backend-only.md](../../../docs/plan/backend-only.md) | 11452<br>`bbbfd322451278b347a068d0dfd08970bd053da0525536dd099efbff2366c0f6`<br>`212df0f055dc38e45330607d5acf956d1c651ef1` |
| [sources/history/repository-05.md](sources/history/repository-05.md) | [docs/plan/backend-only/followup-impact.md](../../../docs/plan/backend-only/followup-impact.md) | 8327<br>`45adfe84c0536b04fb269a048e6fe923f4a82ebed7fb3f2f37d70818575dfd4e`<br>`3bc3430542f3de489339ca1bba290861861bf874` |
| [sources/history/repository-06.md](sources/history/repository-06.md) | [docs/plan/backend-only/test-impact.md](../../../docs/plan/backend-only/test-impact.md) | 27328<br>`f3b4a1f1256051f8fa891850e8ee5a82030430713cfe857dd44b3c59db6cbbf1`<br>`5e7a38fbc2b0e329ce147a2354f683ff5271009f` |
| [sources/history/repository-07.md](sources/history/repository-07.md) | [docs/plan/connector-recovery.md](../../../docs/plan/connector-recovery.md) | 9645<br>`71a0e7845b205f60ecc29b91e66bea2f2086004c16212c03034a51fcbb5b6352`<br>`6260106d36633f4b950c37cf7f2bcdbddc317ad9` |
| [sources/history/repository-08.md](sources/history/repository-08.md) | [docs/plan/b3-connection-error-recovery-active.md](../../../docs/plan/b3-connection-error-recovery-active.md) | 12933<br>`2a1ca02e5acdda3c619f6945a17c2bd824c346ef55650865ad366df4e26a361e`<br>`29fa688dadc325b05b70dacc5d23202214c75c45` |
| [sources/history/repository-09.md](sources/history/repository-09.md) | [docs/plan/b-ship/product/implementation-plan.md](../../../docs/plan/b-ship/product/implementation-plan.md) | 2865<br>`ee09963cc93f5bb5418a7aba147b1733334b2062054b343d67d6d12e21a09ec4`<br>`2ce59e5864bab0ead974db26c3cca1d7f83fcde6` |
| [sources/history/repository-10.md](sources/history/repository-10.md) | [docs/plan/b-ship/acceptance.md](../../../docs/plan/b-ship/acceptance.md) | 17863<br>`ea4d83173549412f523d6b5a1b2e1ce29c595bc4174c8e3ae8db56f59ed5b1f2`<br>`8c795aa8dea448af29f36879a32f9ef0e79d6b76` |
| [sources/history/repository-11.md](sources/history/repository-11.md) | [docs/reviews/b-ship/product/progress.md](../../../docs/reviews/b-ship/product/progress.md) | 16822<br>`3cdbad4f1748c7845ac64c3c7b90417173bc1b883e9da0660d79eb7059031baa`<br>`448e9716b5f7b0ebfbbcdfa186130da0c5260226` |
| [sources/history/repository-12.md](sources/history/repository-12.md) | [docs/reviews/api-mcp-docs/verification.md](../../../docs/reviews/api-mcp-docs/verification.md) | 11997<br>`7d7b90870b230248ec1b11ae8d040ab17310d0f3613155b6e2d8a608c108becd`<br>`18ce2fc6be9e793d03e634b5e5d3725e9797db81` |
| [sources/history/repository-13.md](sources/history/repository-13.md) | [docs/plan/agent-mcp-m0/savedplan.md](../../../docs/plan/agent-mcp-m0/savedplan.md) | 17150<br>`4624508d03b3b9a28f8dc6d5db1fa8f002138fec637dd63612a2929cdb07e3f8`<br>`2a9e77fc425a5e349e596d2e2914f2946093b378` |
| [sources/history/repository-14.md](sources/history/repository-14.md) | [docs/plan/agent-mcp-m1/savedplan.md](../../../docs/plan/agent-mcp-m1/savedplan.md) | 15259<br>`4b1c9d6a4fd3e47985f23782451115f595cc4ac681af7f581e2609fec1a7d958`<br>`cca602e82b34cf68f41efb7aecef50e83ad245f7` |
| [sources/history/repository-15.md](sources/history/repository-15.md) | [docs/plan/agent-mcp-m2/savedplan.md](../../../docs/plan/agent-mcp-m2/savedplan.md) | 10893<br>`f4b45e634c015436902440b9da2e934095ae333a8a4c98ff5a1f1e1977bccc57`<br>`658920fcedc8894f26f5550f4de92ff041d025b6` |
| [sources/history/repository-16.md](sources/history/repository-16.md) | [docs/plan/agent-mcp-m3/savedplan.md](../../../docs/plan/agent-mcp-m3/savedplan.md) | 12443<br>`69a24eb15080b8de67810544f4c3ef19706640d2f8afdf83fb42e907fc64b7aa`<br>`a92ec2406583f09c8f5683fb59d5a5aea21c2d80` |
| [sources/history/repository-17.md](sources/history/repository-17.md) | [docs/plan/agent-mcp-m4/savedplan.md](../../../docs/plan/agent-mcp-m4/savedplan.md) | 9563<br>`080360fa6e4d0479449911f0e33cf2e4742dfd4b63aad0b555291fedee5bb690`<br>`1dd8b70936e54630c8091415d559cda5dd2e0e79` |
| [sources/history/repository-18.md](sources/history/repository-18.md) | [docs/plan/agent-mcp-m5/savedplan.md](../../../docs/plan/agent-mcp-m5/savedplan.md) | 12742<br>`b2c4477b0cf73794924feb635279ff76ecdf32241b034fe68010187ce5ede452`<br>`29e30731c01a718e0bf477740fdba8f143dd8bef` |
| [sources/history/repository-19.md](sources/history/repository-19.md) | [docs/plan/agent-mcp-m0/product-recovery-report.md](../../../docs/plan/agent-mcp-m0/product-recovery-report.md) | 8736<br>`cfb6ec511480d060a7415be75a3f9085468a64a14b25e62813e71e5d8b246ccf`<br>`68e03c44b428f04f7004f69c4eb139300c7ef40d` |
| [sources/history/repository-20.md](sources/history/repository-20.md) | [docs/plan/agent-mcp-m1/product-review-repair-report.md](../../../docs/plan/agent-mcp-m1/product-review-repair-report.md) | 12849<br>`df5032182731a4d31f3c6568fa5c7dab411f44644e98a3eb139218a849e13813`<br>`28e95e2fe6219e89519f3a25e25ce3d9533f093c` |
| [sources/history/repository-21.md](sources/history/repository-21.md) | [docs/plan/agent-mcp-m2/product-review-repair-report.md](../../../docs/plan/agent-mcp-m2/product-review-repair-report.md) | 7793<br>`068dafa08b83cf3f8a189a0a0f4a425dc79259727c1f2299cefa54323c416e3c`<br>`7f144a6f7ba7024dc5a553b0170cb8f47ca2dbfa` |
| [sources/history/repository-22.md](sources/history/repository-22.md) | [docs/plan/agent-mcp-m3/review-fixes-report.md](../../../docs/plan/agent-mcp-m3/review-fixes-report.md) | 12761<br>`b7463155e0e120e6a0b9f2335e7bcc07636db14c9261aded665f4807798163d5`<br>`bb8ab6ac1279ca72fd5d5b4678f0900e533076b0` |
| [sources/history/repository-23.md](sources/history/repository-23.md) | [docs/plan/agent-mcp-m4/execution/product-current-report.md](../../../docs/plan/agent-mcp-m4/execution/product-current-report.md) | 11065<br>`beefba5f8034d1f05a665e4b8d23982ccdada5f6f7354bb3a97d4d1378a33378`<br>`7ec950d12e975df8f408921fe5a26f1320c1cc04` |
| [sources/history/repository-24.md](sources/history/repository-24.md) | [docs/plan/agent-mcp-m4/execution/formal-review-response.md](../../../docs/plan/agent-mcp-m4/execution/formal-review-response.md) | 10884<br>`4e54851a5106f623e4df70293869a8ce0b0369bd5a5419d652a715068ed0cbee`<br>`3c1c655647f40a8ab57ff8b7149fb05c1795c09a` |
| [sources/history/repository-25.md](sources/history/repository-25.md) | [docs/plan/agent-mcp-m5/product-current-report.md](../../../docs/plan/agent-mcp-m5/product-current-report.md) | 10416<br>`87063538cc75fc923d5547003a0d87574a8d6b0ad46d84ea5b517f51dc3b5d9b`<br>`9cbbf3f6d4ebd060fdeb6248cb4aaa52d067b414` |

## 历史缺口与衔接

旧 `docs/plan/2026-10-08-todos-functional-alignment.md` 和
`docs/plan/todos-alignment-20261008/` 在本轮 main 的 `ls-tree` 中均不存在。
`git log --all -- <两路径>` 在当前可达历史没有返回。
关联卡正文指向它们，却不提供全文。
[#18 对话](sources/history/conversation-18.md)、[#53 对话](sources/history/conversation-53.md)与
[#61 对话](sources/history/conversation-61.md)没有恢复两路径完整原件。
旧研究全文和旧 #32 方案尾部仍缺源；不以旧本地快照、现行卡或网站现状补造历史。

`backend-only/followup-impact.md` 的 #7、#20、#62 行是生成时安排。
三卡当前 Done，不再设为待开发。
该索引声称旧总计划继续作为来源，本轮 main 实际无文件；记录差异，历史不改写。
F 卡当前全文、`activation-task-specs/` 和 R1 测试覆盖仍可达，不因旧源缺失丢弃明确规格。

## 合入与实际证据

准确 main 的 first-parent 合并链及产品路径的 blob 证明源码可达。
PR 链接定位既有交付，状态以 GitHub 为准，不使用陈旧跟踪 refs。
PR #225 合并的第二 parent 为 `fff06af6ccb99c24a62035f418e850914f37a712`。
[CI #502 原回执](sources/history/ci-502.md)十三 job 成功，绑定原候选。
[读取时 CI 列表](sources/history/current-ci.md)的 main CI #503 当时仍运行，不冒成功。
本卡新提交的 CI 另核，历史候选 CI 不代本卡通过。

M5 的真实 OpenCode/Pi、Human 准备、fake Git 和真实存储分列。
M4 六域及本机 native 不外推其他 OS 或企业认证。
#20 双架构 Linux 完整 guest 安装/重启及真实 Secret Service 不外推真实发布。
原件、限制和消费者证据见覆盖矩阵及对应主线报告。

## 其他实际返回指纹

对话中的运行时间、首败和截断标记不编辑。

- [ci-502.md](sources/history/ci-502.md)：1197 字节，SHA-256 `fa4a739b770944789711fbee8280860bc24310b4577cb2ae5c0a2645da66d45d`。

- [conversation-18.md](sources/history/conversation-18.md)：16179 字节，SHA-256 `891cad42a44c3724583044a3795860f6f3ac5cdaee8488914c647fb3fdbca11d`。

- [conversation-53.md](sources/history/conversation-53.md)：11808 字节，SHA-256 `683aa61b4ea686c0ed41059862e40658b9fd3ebf22f96098590535b3f591e2c8`。

- [conversation-61.md](sources/history/conversation-61.md)：15574 字节，SHA-256 `28c654b3953234ae1e60eb716d0fb2aa39b533145416c7678938fdc472a4f10f`。

- [current-ci.md](sources/history/current-ci.md)：3295 字节，SHA-256 `c8b6cc6cce2dec0b9362f774b233c7f3a49acbc68dcf7411b959ac8414a556f2`。

- [current-conversation.md](sources/history/current-conversation.md)：6661 字节，SHA-256 `7eab1a0387d6fd67ff4be0f1e9886fa3497a7086079d0f668440a29712864ce6`。

- [document-checks.md](sources/history/document-checks.md)：5107 字节，SHA-256 `81e05ae8d67547b935b311b9f99940f06a83feaf5b309cdb91141f261882ba8c`。

- [merge-map.md](sources/history/merge-map.md)：3100 字节，SHA-256 `e08c7a4bd75cffcdaffadb007c35743f1d896ffbdef593c145fba54c157a1e5e`。

- [platform-git-refusal.md](sources/history/platform-git-refusal.md)：660 字节，SHA-256 `ae5c50c8be6d4cb196bf08f60b43f3bd1a5d8516dcabd9b7b9a868b40ffce969`。

- [main-source-binding.md](sources/history/main-source-binding.md)：31301 字节，SHA-256 `446baa20d2e5476775916f5b2665d3a8c9406de0e91cc5474170594e508f5fd5`。

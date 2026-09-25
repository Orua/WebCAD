# api.text-command

executeText({context,idempotencyKey,text,dryRun?}) 提供纯文本命令入口，不执行任意 JS 或 shell。每行一条，最多 20 行、总长 16384 字符。语法：add <操作ID> key=value ...；measure <bodyId|$last>。示例：add box width=30 depth=20 height=2.5 name="牌子"，下一行 measure $last。复杂参数可用 JSON 值，例如 points=[[[0,0,0],[1,0,0],[2,0,0]],[[0,1,0],[1,1,0],[2,1,0]],[[0,2,0],[1,2,0],[2,2,0]]]。refs 可用 JSON 数组或 $last。dryRun:true 仅返回解析后的步骤；正常执行交给同一 api.run/CommandService，返回逐步回执，非原子，已提交步骤保留。每次执行需新 idempotencyKey，重试同一请求可复用原 key。

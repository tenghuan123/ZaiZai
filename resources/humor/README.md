# 仔仔的笑话资源包

[仔仔的桌边休息站](desk-break.json) 是桌面版内置包，含 10 条冷笑话和 10 条打工人吐槽。单击桌宠，选择「讲一个笑话」，可以继续随机抽取，或点「来碗毒鸡汤」切换。内容在本机读取，抽取时无需联网。

## 换成自己的包

复制 `desk-break.json`，按需编辑，然后以 `humor-pack.json` 保存到应用数据目录：

| 环境 | 数据目录 |
| --- | --- |
| macOS 安装版 | `~/Library/Application Support/desktop-buddy-m0/` |
| Windows 安装版 | `%APPDATA%\desktop-buddy-m0\` |
| 开发模式 | 同上，目录名为 `desktop-buddy-m0-dev`；如指定了 `TIA_M0_DATA_DIR`，使用该目录 |

完全退出仔仔后重新打开，应用会用这个包替换内置内容。删除自定义包并重新打开可恢复内置内容。如果文件损坏或格式不合规，应用也会使用内置包，原因记在数据目录中的 `m0-events.ndjson`（`humor-pack-invalid`）。

文件使用 UTF-8 JSON，最多 128 KB。`formatVersion` 为 `1`；`entries` 最多 120 条，每条提供 `kind`（`joke` 笑话或 `roast` 毒鸡汤）和 `text`（1–80 个字符，建议使用短句），两类各至少一条。同类重复文本会合并。`name`、`version`、`sources` 和条目中的 `source`、`reference` 用来记录包版本和出处，应用只展示 `text`。

## 内置内容来源

冷笑话参考网上流传的「海豹／海报」「失绵／失眠」等谐音，重新写成一两句话。毒鸡汤参考「班味」「工位摸鱼」等网络话题，也收录了为仔仔写的办公短句。每条文案在 JSON 里标有参考来源或 `source: "zaizai"`。[谐音梗讨论帖](https://bbs.vivo.com.cn/newbbs/thread/38333415) · [班味话题](https://www.datastory.com.cn/details/1057) · [暑期工顶岗话题](https://www.51ldb.com/shsldb/lbxw/content/3f11b930-3a14-4cc3-a69a-1696cef328e0.htm)

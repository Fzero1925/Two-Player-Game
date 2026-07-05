/**
 * Shared word bank for the Pictionary (你画我猜) game.
 *
 * This lives in its own file so it can be imported by BOTH:
 *  - server.ts (Node, local-fallback mode)
 *  - definitions.ts (browser + Node, Supabase mode)
 * without duplicating the list in two places (which had drifted before).
 */

export interface PictionaryWord {
  word: string;
  category: string;
}

export const PICTIONARY_WORDS: PictionaryWord[] = [
  { word: "猫", category: "动物" },
  { word: "狗", category: "动物" },
  { word: "熊猫", category: "动物" },
  { word: "兔子", category: "动物" },
  { word: "老虎", category: "动物" },
  { word: "大象", category: "动物" },
  { word: "恐龙", category: "动物" },
  { word: "企鹅", category: "动物" },
  { word: "海豚", category: "动物" },
  { word: "章鱼", category: "动物" },
  { word: "小鸟", category: "动物" },
  { word: "长颈鹿", category: "动物" },
  { word: "苹果", category: "水果" },
  { word: "香蕉", category: "水果" },
  { word: "西瓜", category: "水果" },
  { word: "草莓", category: "水果" },
  { word: "葡萄", category: "水果" },
  { word: "橙子", category: "水果" },
  { word: "汉堡", category: "食物" },
  { word: "比萨", category: "食物" },
  { word: "冰激凌", category: "食物" },
  { word: "面条", category: "食物" },
  { word: "蛋糕", category: "食物" },
  { word: "汽车", category: "交通工具" },
  { word: "自行车", category: "交通工具" },
  { word: "飞机", category: "交通工具" },
  { word: "轮船", category: "交通工具" },
  { word: "火箭", category: "交通工具" },
  { word: "手机", category: "电子产品" },
  { word: "电脑", category: "电子产品" },
  { word: "电视", category: "电子产品" },
  { word: "太阳", category: "大自然" },
  { word: "月亮", category: "大自然" },
  { word: "星星", category: "大自然" },
  { word: "彩虹", category: "大自然" },
  { word: "云朵", category: "大自然" },
  { word: "雨伞", category: "生活用品" },
  { word: "眼镜", category: "生活用品" },
  { word: "帽子", category: "服饰" },
  { word: "鞋子", category: "服饰" },
  { word: "书包", category: "生活用品" },
  { word: "杯子", category: "生活用品" },
  { word: "铅笔", category: "生活用品" },
  { word: "吉他", category: "乐器" },
  { word: "钢琴", category: "乐器" },
  { word: "房子", category: "建筑物" },
  { word: "雪人", category: "大自然" },
  { word: "花朵", category: "大自然" },
  { word: "大树", category: "大自然" },
  { word: "气球", category: "玩具" },
];

export function getRandomPictionaryWord(): PictionaryWord {
  return PICTIONARY_WORDS[Math.floor(Math.random() * PICTIONARY_WORDS.length)];
}

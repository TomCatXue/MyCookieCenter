/**
 * B站全部分区列表修复脚本 (包含港澳台专属分区与各子项跳转修复) - Loon
 * 来源：BiliUniverse/Enhanced 官方完整数据与 URI 结构
 */

const regionList = [
    {
        "tid": 1,
        "reid": 0,
        "name": "动画",
        "logo": "http://i0.hdslb.com/bfs/archive/9b3bb8cfc8d87809ffa409bc65def8d8c3eaf72b.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/1",
        "type": 0
    },
    {
        "tid": 3,
        "reid": 0,
        "name": "音乐",
        "logo": "http://i0.hdslb.com/bfs/archive/3a99c51d00038ced3989686b6f3c49d01aa34207.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/3",
        "type": 0
    },
    {
        "tid": 4,
        "reid": 0,
        "name": "游戏",
        "logo": "http://i0.hdslb.com/bfs/archive/9c88ce1adaecf31e27121bdbb5a29824d655d0a6.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/4",
        "type": 0
    },
    {
        "tid": 5,
        "reid": 0,
        "name": "娱乐",
        "logo": "http://i0.hdslb.com/bfs/archive/a9bcb4cb7e216c2ea28ba3dc10acd2d210f739bd.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/5",
        "type": 0
    },
    {
        "tid": 11,
        "reid": 0,
        "name": "电视剧",
        "logo": "http://i0.hdslb.com/bfs/archive/30779a6904875754762e666b7076014528ef4834.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://pgc/cinema/tv",
        "type": 0,
        "is_bangumi": 1
    },
    {
        "tid": 13,
        "reid": 0,
        "name": "番剧",
        "logo": "http://i0.hdslb.com/bfs/archive/6f629bd0dcd71d7b9911803f8e4f94fd0e5b4bfd.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://pgc/partition_page?page_name=bangumi-operation&title=%E7%95%AA%E5%89%A7&select_id=1",
        "type": 1,
        "is_bangumi": 1
    },
    {
        "tid": 23,
        "reid": 0,
        "name": "电影",
        "logo": "http://i0.hdslb.com/bfs/archive/137edde9deb7dfcdf610ed2d1ec63bae6ef3ba0a.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://pgc/cinema/movie",
        "type": 0,
        "is_bangumi": 1
    },
    {
        "tid": 36,
        "reid": 0,
        "name": "知识",
        "logo": "http://i0.hdslb.com/bfs/archive/d5bb279936dbe661f958683231566214056987b2.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/36",
        "type": 0
    },
    {
        "tid": 119,
        "reid": 0,
        "name": "鬼畜",
        "logo": "http://i0.hdslb.com/bfs/archive/de50290b11c65108eb70766fa887032b948d2e4b.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/119",
        "type": 0
    },
    {
        "tid": 129,
        "reid": 0,
        "name": "舞蹈",
        "logo": "http://i0.hdslb.com/bfs/archive/4769a6faa9ccfde4a029eca36b979bac486afd14.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/129",
        "type": 0
    },
    {
        "tid": 155,
        "reid": 0,
        "name": "时尚",
        "logo": "http://i0.hdslb.com/bfs/archive/1842562be5ded346d79312b24fafedbc1d78c8e2.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/155",
        "type": 0
    },
    {
        "tid": 160,
        "reid": 0,
        "name": "生活",
        "logo": "http://i0.hdslb.com/bfs/archive/50731fc4b9ec487ef2e3861a97e0eb4671b7bcef.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/160",
        "type": 0
    },
    {
        "tid": 167,
        "reid": 0,
        "name": "国创",
        "logo": "http://i0.hdslb.com/bfs/archive/1586ec926eac1ea876cb74d32df51394d8e72341.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://pgc/partition_page?page_name=gc-operation&title=%E5%9B%BD%E5%88%9B&select_id=1",
        "type": 1,
        "is_bangumi": 1
    },
    {
        "tid": 177,
        "reid": 0,
        "name": "纪录片",
        "logo": "http://i0.hdslb.com/bfs/archive/884a644c6bb4b8bb16f9746ef35fbaba396e0b8c.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://pgc/partition_page?page_name=documentary-operation&title=%E7%BA%AA%E5%BD%95%E7%89%87&select_id=1",
        "type": 1
    },
    {
        "tid": 181,
        "reid": 0,
        "name": "影视",
        "logo": "http://i0.hdslb.com/bfs/archive/f90bb1ef59630ad9765486c6088a4944b96e88a3.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/181",
        "type": 0
    },
    {
        "tid": 188,
        "reid": 0,
        "name": "科技",
        "logo": "http://i0.hdslb.com/bfs/feed-admin/4a687a86b49feea68d423fd1bf2c461acfe59b70.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/188",
        "type": 0
    },
    {
        "tid": 202,
        "reid": 0,
        "name": "资讯",
        "logo": "https://i0.hdslb.com/bfs/legacy/d71e70e1bfcb7b27ffe88e6cb82868c68b084464.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/202",
        "type": 0
    },
    {
        "tid": 211,
        "reid": 0,
        "name": "美食",
        "logo": "http://i0.hdslb.com/bfs/feed-admin/0f5e21f08616f9c02d706433ba1c00bd5b889c7b.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/211",
        "type": 0
    },
    {
        "tid": 217,
        "reid": 0,
        "name": "动物圈",
        "logo": "http://i0.hdslb.com/bfs/feed-admin/9f3303b20e12ac874c379da09bca9ce4d0b2f88c.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/217",
        "type": 0
    },
    {
        "tid": 223,
        "reid": 0,
        "name": "汽车",
        "logo": "http://i0.hdslb.com/bfs/feed-admin/1515d944550494abf81b552a84484dce80287242.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/223",
        "type": 0
    },
    {
        "tid": 234,
        "reid": 0,
        "name": "运动",
        "logo": "http://i0.hdslb.com/bfs/feed-admin/56a67fa38d8d7378ab4154307d26cffce2d1ae3f.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://region/234",
        "type": 0
    },
    {
        "tid": 65537,
        "reid": 0,
        "name": "直播",
        "logo": "http://i0.hdslb.com/bfs/archive/1b0ac7eafd51b03a0dc5b2390eec2fbffb25adf7.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://home/?tab=直播",
        "type": 0
    },
    {
        "tid": 65539,
        "reid": 0,
        "name": "游戏中心",
        "logo": "http://i0.hdslb.com/bfs/archive/656df3124c81dd0e19bdc0a3e017091268b3db73.jpg",
        "goto": "",
        "param": "",
        "uri": "bilibili://game_center",
        "type": 1
    },
    {
        "tid": 65541,
        "reid": 0,
        "name": "专栏",
        "logo": "http://i0.hdslb.com/bfs/archive/a0c0e133644c47d6263cf24cf8364e2106c102c3.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://article/category/",
        "type": 1
    },
    {
        "tid": 65545,
        "reid": 0,
        "name": "放映厅",
        "logo": "http://i0.hdslb.com/bfs/archive/3dfba664353bb2349917eaf81b60db34b2d4c61a.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://pgc/cinema",
        "type": 1
    },
    {
        "tid": 65549,
        "reid": 0,
        "name": "工房集市",
        "logo": "http://i0.hdslb.com/bfs/feed-admin/d89a76f987820ffa3c7d5c62789ebd784c68ac07.png",
        "goto": "",
        "param": "",
        "uri": "https://mall.bilibili.com/neul-next/index.html?page=mall-up_market&noTitleBar=1&msource=js_subarea",
        "type": 0
    },
    {
        "tid": 65550,
        "reid": 0,
        "name": "游戏赛事",
        "logo": "http://i0.hdslb.com/bfs/archive/a93687a7f29da88ee375109389b0634412847bd1.png",
        "goto": "",
        "param": "",
        "uri": "https://www.bilibili.com/h5/match/data/home?navhide=1",
        "type": 0
    },
    {
        "tid": 65551,
        "reid": 0,
        "name": "小黑屋",
        "logo": "http://i0.hdslb.com/bfs/archive/ed4f676e8c1f1029b8e37e2f567875b682e632ce.png",
        "goto": "",
        "param": "",
        "uri": "https://www.bilibili.com/blackroom",
        "type": 0
    },
    {
        "tid": 65552,
        "reid": 0,
        "name": "全区排行榜",
        "logo": "http://i0.hdslb.com/bfs/archive/34f46c749054b1c3c157b0c1c09a5ef2b3539204.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://rank/",
        "type": 0
    },
    {
        "tid": 65553,
        "reid": 0,
        "name": "活动中心",
        "logo": "http://i0.hdslb.com/bfs/archive/3e2e6d338aa8156dc6f63c5dc8c75ed298c5cc9a.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://activity_center/",
        "type": 0
    },
    {
        "tid": 65555,
        "reid": 0,
        "name": "漫画",
        "logo": "http://i0.hdslb.com/bfs/archive/d260e72fb98251dabe4f64858f65cc697a71587e.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://comic/home?from=manga_channel",
        "type": 0
    },
    {
        "tid": 65556,
        "reid": 0,
        "name": "原創排行榜",
        "logo": "http://i0.hdslb.com/bfs/archive/5f232dbcb590e81dbd3dab6d2c906cff70547841.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://rank?type=original",
        "type": 0
    },
    {
        "tid": 65557,
        "reid": 0,
        "name": "公开课",
        "logo": "http://i0.hdslb.com/bfs/feed-admin/99366a6ea47d7790f57699112bc1d0c6d5f0d302.png",
        "goto": "",
        "param": "",
        "uri": "https://m.bilibili.com/cheese/home?navhide=1",
        "type": 0
    },
    {
        "tid": 65559,
        "reid": 0,
        "name": "VLOG",
        "logo": "http://i0.hdslb.com/bfs/archive/c794e8220a8cbe3d83b83e76e753c57df67b036a.png",
        "goto": "",
        "param": "",
        "uri": "https://www.bilibili.com/h5/vlog?from=2",
        "type": 0
    },
    {
        "tid": 65560,
        "reid": 0,
        "name": "课堂",
        "logo": "http://i0.hdslb.com/bfs/archive/7400e63e28ab9933a3fa8adb3bd63e3a20911641.png",
        "goto": "",
        "param": "",
        "uri": "https://m.bilibili.com/cheese/home?navhide=1",
        "type": 0
    },
    {
        "tid": 65561,
        "reid": 0,
        "name": "专题中心",
        "logo": "http://i0.hdslb.com/bfs/archive/5c15009ace7f8bbb22c5b46cee3995525bbd9ed0.png",
        "goto": "",
        "param": "",
        "uri": "https://www.bilibili.com/blackboard/activity-list.html?navhide=1",
        "type": 0
    },
    {
        "tid": 65563,
        "reid": 0,
        "name": "新歌热榜",
        "logo": "http://i0.hdslb.com/bfs/archive/518ba4a46b8ca94c0f29397e09acb345020fb867.png",
        "goto": "",
        "param": "",
        "uri": "https://www.bilibili.com/v/popular/rank/music",
        "type": 0
    },
    {
        "tid": 6544,
        "reid": 0,
        "name": "番劇(港澳台)",
        "logo": "http://i0.hdslb.com/bfs/archive/6f629bd0dcd71d7b9911803f8e4f94fd0e5b4bfd.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://following/home_bottom_tab_activity_tab/6544",
        "type": 0,
        "is_bangumi": 1
    },
    {
        "tid": 95636,
        "reid": 0,
        "name": "韩综(港澳台)",
        "logo": "http://i0.hdslb.com/bfs/archive/a9bcb4cb7e216c2ea28ba3dc10acd2d210f739bd.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://following/home_bottom_tab_activity_tab/95636",
        "type": 0,
        "is_bangumi": 1
    },
    {
        "tid": 168312,
        "reid": 0,
        "name": "節目(港澳台)",
        "logo": "http://i0.hdslb.com/bfs/archive/f90bb1ef59630ad9765486c6088a4944b96e88a3.png",
        "goto": "",
        "param": "",
        "uri": "bilibili://following/home_bottom_tab_activity_tab/168312",
        "type": 0
    }
];

$done({
    response: {
        status: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*"
        },
        body: JSON.stringify({
            code: 0,
            message: "0",
            ttl: 1,
            data: regionList
        })
    }
});

/**
 * B站分区列表修复脚本 - Loon
 * 解决国际版/旧版客户端请求 x/v2/channel/region/list 返回404导致分区页空白的问题
 */

const regionData = {
    code: 0,
    message: "0",
    ttl: 1,
    data: [
        { tid: 1, reid: 0, name: "动画", logo: "http://i0.hdslb.com/bfs/archive/d507b5a2bf2a420dfa5e01b3b1464b0f92f24155.png", goto: "0", param: "", type: 0 },
        { tid: 13, reid: 0, name: "番剧", logo: "http://i0.hdslb.com/bfs/archive/4d7c81d8c11e74f177651a5c18171092eb29b350.png", goto: "0", param: "", type: 0 },
        { tid: 167, reid: 0, name: "国创", logo: "http://i0.hdslb.com/bfs/archive/a2c0792db87d7f722f4d6d63f03b57351ffbf058.png", goto: "0", param: "", type: 0 },
        { tid: 3, reid: 0, name: "音乐", logo: "http://i0.hdslb.com/bfs/archive/b753a8d9a4ccf4ebfa4aa7a9a147e53f0ea2d6bc.png", goto: "0", param: "", type: 0 },
        { tid: 129, reid: 0, name: "舞蹈", logo: "http://i0.hdslb.com/bfs/archive/22f183ce52d6a59be5fb2d5a3ef1da2ad0ecf628.png", goto: "0", param: "", type: 0 },
        { tid: 4, reid: 0, name: "游戏", logo: "http://i0.hdslb.com/bfs/archive/e4ca8332ebfa32ae8b1d9bf16c683b5f00e9ec19.png", goto: "0", param: "", type: 0 },
        { tid: 36, reid: 0, name: "知识", logo: "http://i0.hdslb.com/bfs/archive/9b85c1ec8be68f9464e83f2a89c8a946df4f25b3.png", goto: "0", param: "", type: 0 },
        { tid: 188, reid: 0, name: "科技", logo: "http://i0.hdslb.com/bfs/archive/c444f6ab0e5e018fb5b5fe19b668f44d93540e21.png", goto: "0", param: "", type: 0 },
        { tid: 234, reid: 0, name: "运动", logo: "http://i0.hdslb.com/bfs/archive/4c37ffcb8cb0ea0ae5321ab9b9f9ff47702cae14.png", goto: "0", param: "", type: 0 },
        { tid: 223, reid: 0, name: "汽车", logo: "http://i0.hdslb.com/bfs/archive/756858e370e5ff30f878f9fcfabdc84c718c5e6d.png", goto: "0", param: "", type: 0 },
        { tid: 160, reid: 0, name: "生活", logo: "http://i0.hdslb.com/bfs/archive/9ef17769931cc36be272d174bb0df5e6e890c213.png", goto: "0", param: "", type: 0 },
        { tid: 211, reid: 0, name: "美食", logo: "http://i0.hdslb.com/bfs/archive/af179354674dcdae87b7a1e05dcf9e1d1f08bc17.png", goto: "0", param: "", type: 0 },
        { tid: 217, reid: 0, name: "动物圈", logo: "http://i0.hdslb.com/bfs/archive/2d216f44d57c79e6027a02796e625a697ce7b4db.png", goto: "0", param: "", type: 0 },
        { tid: 119, reid: 0, name: "鬼畜", logo: "http://i0.hdslb.com/bfs/archive/52b1b369c735d4681cfd2e67a0ffc6cbccfec34d.png", goto: "0", param: "", type: 0 },
        { tid: 155, reid: 0, name: "时尚", logo: "http://i0.hdslb.com/bfs/archive/557f925f385c4bf4aa7ceefc3a2a9bbceabf9d50.png", goto: "0", param: "", type: 0 },
        { tid: 5, reid: 0, name: "娱乐", logo: "http://i0.hdslb.com/bfs/archive/77b81b5113d09a2503d29ae61bc46ee78ae3cc63.png", goto: "0", param: "", type: 0 },
        { tid: 181, reid: 0, name: "影视", logo: "http://i0.hdslb.com/bfs/archive/b88b75f81014e7a76c66cf17fcf86c8f4e24ebc6.png", goto: "0", param: "", type: 0 }
    ]
};

$done({
    response: {
        status: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*"
        },
        body: JSON.stringify(regionData)
    }
});

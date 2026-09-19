/**
 * B站全部分区列表优化与修复脚本 (支持 gRPC 新版卡片分组、快捷访问及 HTTP 多级子分类) - Loon
 * 来源：融合 Biliverse: Enhanced 官方全部分区与原版高分资源架构
 */

// --- 超轻量 Protobuf 编解码器 ---
class ProtoWriter {
    constructor() { this.buf = []; }
    tag(f, w) { this.varint((f << 3) | w); }
    varint(v) {
        let n = BigInt(v);
        while (n >= 0x80n) {
            this.buf.push(Number(n & 0x7fn) | 0x80);
            n >>= 7n;
        }
        this.buf.push(Number(n));
    }
    string(s) {
        const b = typeof Buffer !== 'undefined' ? Buffer.from(s || '', 'utf8') : new TextEncoder().encode(s || '');
        this.varint(b.length);
        for (let i = 0; i < b.length; i++) this.buf.push(b[i]);
    }
    bytes(b) {
        this.varint(b.length);
        for (let i = 0; i < b.length; i++) this.buf.push(b[i]);
    }
    finish() { return new Uint8Array(this.buf); }
}

class ProtoReader {
    constructor(b) {
        this.buf = b instanceof Uint8Array ? b : new Uint8Array(b || []);
        this.pos = 0;
        this.len = this.buf.length;
    }
    hasMore() { return this.pos < this.len; }
    tag() {
        const v = this.varint();
        return [Number(v >> 3n), Number(v & 7n)];
    }
    varint() {
        let res = 0n, shift = 0n;
        while (this.pos < this.len) {
            const b = BigInt(this.buf[this.pos++]);
            res |= (b & 0x7fn) << shift;
            if ((b & 0x80n) === 0n) return res;
            shift += 7n;
        }
        return res;
    }
    string() {
        const len = Number(this.varint());
        const slice = this.buf.subarray(this.pos, this.pos + len);
        this.pos += len;
        return typeof Buffer !== 'undefined' ? Buffer.from(slice).toString('utf8') : new TextDecoder().decode(slice);
    }
    bytes() {
        const len = Number(this.varint());
        const slice = this.buf.subarray(this.pos, this.pos + len);
        this.pos += len;
        return slice;
    }
    skip(w) {
        if (w === 0) this.varint();
        else if (w === 1) this.pos += 8;
        else if (w === 2) { const l = Number(this.varint()); this.pos += l; }
        else if (w === 5) this.pos += 4;
    }
}

// --- gRPC 帧操作 ---
function unwrapGrpc(data) {
    if (!data) return new Uint8Array(0);
    let bytes;
    if (data instanceof Uint8Array) {
        bytes = data;
    } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
    } else if (typeof data === 'string') {
        bytes = (typeof Buffer !== 'undefined') ? Buffer.from(data, 'binary') : new TextEncoder().encode(data);
    } else {
        bytes = new Uint8Array(data);
    }
    if (bytes.length < 5) return new Uint8Array(0);
    return bytes.subarray(5);
}

function wrapGrpc(payload) {
    const len = payload.length;
    const header = new Uint8Array(5);
    header[0] = 0;
    header[1] = (len >> 24) & 0xff;
    header[2] = (len >> 16) & 0xff;
    header[3] = (len >> 8) & 0xff;
    header[4] = len & 0xff;
    const res = new Uint8Array(5 + len);
    res.set(header, 0);
    res.set(payload, 5);
    return res;
}

// --- Protobuf 消息编解码 (RegionListReply) ---
function encodeIcon(icon) {
    const w = new ProtoWriter();
    if (icon.img) { w.tag(1, 2); w.string(icon.img); }
    if (icon.title) { w.tag(2, 2); w.string(icon.title); }
    if (icon.url) { w.tag(3, 2); w.string(icon.url); }
    if (icon.uniqueId && icon.uniqueId !== '0') { w.tag(4, 0); w.varint(icon.uniqueId); }
    if (icon.rid && icon.rid !== '0') { w.tag(5, 0); w.varint(icon.rid); }
    return w.finish();
}

function decodeIcon(buf) {
    const r = new ProtoReader(buf);
    const icon = { img: '', title: '', url: '', uniqueId: '0', rid: '0' };
    while (r.hasMore()) {
        const [f, w] = r.tag();
        if (f === 1 && w === 2) icon.img = r.string();
        else if (f === 2 && w === 2) icon.title = r.string();
        else if (f === 3 && w === 2) icon.url = r.string();
        else if (f === 4 && w === 0) icon.uniqueId = r.varint().toString();
        else if (f === 5 && w === 0) icon.rid = r.varint().toString();
        else r.skip(w);
    }
    return icon;
}

function encodeContent(content) {
    const w = new ProtoWriter();
    if (content.title) { w.tag(1, 2); w.string(content.title); }
    if (content.icons && content.icons.length > 0) {
        for (const icon of content.icons) {
            w.tag(2, 2);
            w.bytes(encodeIcon(icon));
        }
    }
    return w.finish();
}

function decodeContent(buf) {
    const r = new ProtoReader(buf);
    const content = { title: '', icons: [] };
    while (r.hasMore()) {
        const [f, w] = r.tag();
        if (f === 1 && w === 2) content.title = r.string();
        else if (f === 2 && w === 2) content.icons.push(decodeIcon(r.bytes()));
        else r.skip(w);
    }
    return content;
}

function encodeRegionListReply(reply) {
    const w = new ProtoWriter();
    if (reply.shortcut) {
        w.tag(1, 2);
        w.bytes(encodeContent(reply.shortcut));
    }
    if (reply.contents && reply.contents.length > 0) {
        for (const c of reply.contents) {
            w.tag(2, 2);
            w.bytes(encodeContent(c));
        }
    }
    return w.finish();
}

function decodeRegionListReply(buf) {
    const r = new ProtoReader(buf);
    const reply = { shortcut: null, contents: [] };
    while (r.hasMore()) {
        const [f, w] = r.tag();
        if (f === 1 && w === 2) reply.shortcut = decodeContent(r.bytes());
        else if (f === 2 && w === 2) reply.contents.push(decodeContent(r.bytes()));
        else r.skip(w);
    }
    return reply;
}


// --- 内置高清分区与服务数据 ---
const REGION_LIST_CONFIG = {"defaultShortcut":["2036","2037","780","545","151"],"groups":[{"title":"默认分区","ids":["2036","2037","780","545","151"]},{"title":"推荐分区/服务","ids":["65552","65563","65549","65551","65539","65550","65555","65560","65541","65565","2280","136117"]},{"title":"港澳台分区/服务","ids":["774","801","884","1028"]},{"title":"全部分区","ids":["13","167","177","23","11","65545","1001","1002","1003","1004","1005","1006","1007","1008","1009","1010","1011","1012","1013","1014","1015","1016","1017","1018","1019","1020","1021","1022","1023","1024","1025","1026","1027","1029","1030","1031"]}],"items":{"11":{"img":"https://i0.hdslb.com/bfs/app/0f657fc9754b0af3b300523597b376a0c59f9df7.png","title":"电视剧","url":"bilibili://pgc/partition_page?page_name=tv-operation&title=%E7%94%B5%E8%A7%86%E5%89%A7&select_id=1","rid":"11","tab_id":"11"},"13":{"img":"https://i0.hdslb.com/bfs/app/3c2f00abc8c6272effd4d7039d344b4c55336d65.png","title":"番剧","url":"bilibili://pgc/partition_page?page_name=bangumi-operation&title=%E7%95%AA%E5%89%A7&select_id=1","rid":"13","tab_id":"13"},"23":{"img":"https://i0.hdslb.com/bfs/app/bc37217c3e1fb340c354622f7982b1fd5fd4c3a4.png","title":"电影","url":"bilibili://pgc/page/operation_list?page_id=movie-operation&title=%E7%94%B5%E5%BD%B1","rid":"23","tab_id":"23"},"151":{"img":"https://i0.hdslb.com/bfs/app/efa9bb08dda98aef6799dcde63a3fad14c27da5c.png","title":"影视","url":"bilibili://pgc/cinema-tab","rid":"151","tab_id":"film"},"167":{"img":"https://i0.hdslb.com/bfs/app/d78adc96c54bf604dacbf48dddaab8b28c60c350.png","title":"国创","url":"bilibili://pgc/partition_page?page_name=gc-operation&title=%E5%9B%BD%E5%88%9B&select_id=1","rid":"167","tab_id":"167"},"177":{"img":"https://i0.hdslb.com/bfs/app/2a718a470e72a63f1751dfd65a21586fd7f3fa1b.png","title":"纪录片","url":"bilibili://pgc/partition_page?page_name=documentary-operation&title=%E7%BA%AA%E5%BD%95%E7%89%87&select_id=1","rid":"177","tab_id":"177"},"545":{"img":"https://i0.hdslb.com/bfs/app/3c2f00abc8c6272effd4d7039d344b4c55336d65.png","title":"追番","url":"bilibili://pgc/home","rid":"545","tab_id":"bangumi"},"774":{"img":"https://i0.hdslb.com/bfs/app/3c2f00abc8c6272effd4d7039d344b4c55336d65.png","title":"动画（港澳台）","url":"bilibili://following/home_activity_tab/6544","rid":"774","tab_id":"anime"},"780":{"img":"https://i0.hdslb.com/bfs/app/b1f1f105479640fd9a8d9f80286dcb76c59230b5.png","title":"热门","url":"bilibili://pegasus/hottopic","rid":"780","tab_id":"hottopic"},"801":{"img":"https://i0.hdslb.com/bfs/app/73e9db5ba181fecf06bc717a666cc5a95d0f3102.png","title":"韩综（港澳台）","url":"bilibili://following/home_activity_tab/95636","rid":"801","tab_id":"koreavtw"},"884":{"img":"http://i0.hdslb.com/bfs/archive/f90bb1ef59630ad9765486c6088a4944b96e88a3.png","title":"节目","url":"bilibili://following/home_bottom_tab_activity_tab/168312","rid":"884","tab_id":"ogv"},"1001":{"img":"https://i0.hdslb.com/bfs/app/efa9bb08dda98aef6799dcde63a3fad14c27da5c.png","title":"影视","url":"bilibili://main/regionv2/detail/1001","rid":"1001","tab_id":"1001"},"1002":{"img":"https://i0.hdslb.com/bfs/app/73e9db5ba181fecf06bc717a666cc5a95d0f3102.png","title":"娱乐","url":"bilibili://main/regionv2/detail/1002","rid":"1002","tab_id":"1002"},"1003":{"img":"https://i0.hdslb.com/bfs/app/26466b52dab018988634b43d6ce42953864c3317.png","title":"音乐","url":"bilibili://main/regionv2/detail/1003","rid":"1003","tab_id":"1003"},"1004":{"img":"https://i0.hdslb.com/bfs/app/2346c58247703341cbf71490271e669ca369194d.png","title":"舞蹈","url":"bilibili://main/regionv2/detail/1004","rid":"1004","tab_id":"1004"},"1005":{"img":"https://i0.hdslb.com/bfs/app/bc2b52b81b2e279e9091ba73a008286fd96899f5.png","title":"动画","url":"bilibili://main/regionv2/detail/1005","rid":"1005","tab_id":"1005"},"1006":{"img":"https://i0.hdslb.com/bfs/app/9c41509bf505a204b58c9ba8004a0b41557ead06.png","title":"绘画","url":"bilibili://main/regionv2/detail/1006","rid":"1006","tab_id":"1006"},"1007":{"img":"https://i0.hdslb.com/bfs/app/24273b257608d65d88048a399d3f6d63380aea81.png","title":"鬼畜","url":"bilibili://main/regionv2/detail/1007","rid":"1007","tab_id":"1007"},"1008":{"img":"https://i0.hdslb.com/bfs/app/57d63bc4142ae1da69b1e8bf9a401f64a6d755b1.png","title":"游戏","url":"bilibili://main/regionv2/detail/1008","rid":"1008","tab_id":"1008"},"1009":{"img":"https://i0.hdslb.com/bfs/app/5adb29e49944552880f4bfcaa44d979b43ac979d.png","title":"资讯","url":"bilibili://main/regionv2/detail/1009","rid":"1009","tab_id":"1009"},"1010":{"img":"https://i0.hdslb.com/bfs/app/d94cca46f64e6011417c9f12436221d54073355f.png","title":"知识","url":"bilibili://main/regionv2/detail/1010","rid":"1010","tab_id":"1010"},"1011":{"img":"https://i0.hdslb.com/bfs/app/41b31a3d4d775d864724975f4d1f265230b431c1.png","title":"人工智能","url":"bilibili://main/regionv2/detail/1011","rid":"1011","tab_id":"1011"},"1012":{"img":"https://i0.hdslb.com/bfs/app/c26ddc8a04f8bdd87cb1c2abafbf7d8adaeca7f5.png","title":"科技数码","url":"bilibili://main/regionv2/detail/1012","rid":"1012","tab_id":"1012"},"1013":{"img":"https://i0.hdslb.com/bfs/app/dc27539ab509fe82e0502ba99636293113d63f4b.png","title":"汽车","url":"bilibili://main/regionv2/detail/1013","rid":"1013","tab_id":"1013"},"1014":{"img":"https://i0.hdslb.com/bfs/app/09573a665a17a60f11aa3e0efe300d3957db0d2a.png","title":"时尚美妆","url":"bilibili://main/regionv2/detail/1014","rid":"1014","tab_id":"1014"},"1015":{"img":"https://i0.hdslb.com/bfs/app/c6fb48c18cf8399644c4ee709fc8979952f698c9.png","title":"家装房产","url":"bilibili://main/regionv2/detail/1015","rid":"1015","tab_id":"1015"},"1016":{"img":"https://i0.hdslb.com/bfs/app/29826b70f8bba851f611e02911a93c8be0fab887.png","title":"户外潮流","url":"bilibili://main/regionv2/detail/1016","rid":"1016","tab_id":"1016"},"1017":{"img":"https://i0.hdslb.com/bfs/app/6b93058ade817fb2b14b7e7b9c17ac8a7c2f3ae4.png","title":"健身","url":"bilibili://main/regionv2/detail/1017","rid":"1017","tab_id":"1017"},"1018":{"img":"https://i0.hdslb.com/bfs/app/812a9fe834076e487a0892dcd00db3c77e92f500.png","title":"体育运动","url":"bilibili://main/regionv2/detail/1018","rid":"1018","tab_id":"1018"},"1019":{"img":"https://i0.hdslb.com/bfs/app/83735a2cd10e365a85c6b6b6631be0500dba31ac.png","title":"手工","url":"bilibili://main/regionv2/detail/1019","rid":"1019","tab_id":"1019"},"1020":{"img":"https://i0.hdslb.com/bfs/app/7b312edc2929538cfc4b0f240c8edc19cbb1aad4.png","title":"美食","url":"bilibili://main/regionv2/detail/1020","rid":"1020","tab_id":"1020"},"1021":{"img":"https://i0.hdslb.com/bfs/app/d7d02701405c8ea5aa9e951e4920fdacb169854a.png","title":"小剧场","url":"bilibili://main/regionv2/detail/1021","rid":"1021","tab_id":"1021"},"1022":{"img":"https://i0.hdslb.com/bfs/app/1912f74143f4a054f971db3dc594cade9cf7cd53.png","title":"旅游出行","url":"bilibili://main/regionv2/detail/1022","rid":"1022","tab_id":"1022"},"1023":{"img":"https://i0.hdslb.com/bfs/app/05c06713a99f0a1cd4e7a9e93efc764b4a7db334.png","title":"三农","url":"bilibili://main/regionv2/detail/1023","rid":"1023","tab_id":"1023"},"1024":{"img":"https://i0.hdslb.com/bfs/app/c84dab04b277fdc6d6b40272cf3f9279d9463a7a.png","title":"动物","url":"bilibili://main/regionv2/detail/1024","rid":"1024","tab_id":"1024"},"1025":{"img":"https://i0.hdslb.com/bfs/app/0747e4e4bc7f94e45c0861e7d8b4de0ff4e896c2.png","title":"亲子","url":"bilibili://main/regionv2/detail/1025","rid":"1025","tab_id":"1025"},"1026":{"img":"https://i0.hdslb.com/bfs/app/17c8747c8fc2ae7d9a9d2e5bed33273b5e54319c.png","title":"健康","url":"bilibili://main/regionv2/detail/1026","rid":"1026","tab_id":"1026"},"1027":{"img":"https://i0.hdslb.com/bfs/app/d201464bc5406a2cdf9e25c20fa86577da2b16f4.png","title":"情感","url":"bilibili://main/regionv2/detail/1027","rid":"1027","tab_id":"1027"},"1028":{"img":"http://i0.hdslb.com/bfs/feed-admin/569a9178aa707f2f2494e34bb6eb1d9d14bd9a7b.png","title":"我的NFT","url":"https://www.bilibili.com/h5/pangu/gat?navhide=1","rid":"1028","tab_id":"1028"},"1029":{"img":"https://i0.hdslb.com/bfs/app/87aaea3f8ffabc9ad3d434f2bf6dc09192207a21.png","title":"vlog","url":"bilibili://main/regionv2/detail/1029","rid":"1029","tab_id":"1029"},"1030":{"img":"https://i0.hdslb.com/bfs/app/238dbdf0342b89c52793039da035b12e6d31b44e.png","title":"生活兴趣","url":"bilibili://main/regionv2/detail/1030","rid":"1030","tab_id":"1030"},"1031":{"img":"https://i0.hdslb.com/bfs/app/0f174e1627b29bf897c60ba5068bc00265dc9951.png","title":"生活经验","url":"bilibili://main/regionv2/detail/1031","rid":"1031","tab_id":"1031"},"2036":{"img":"https://i0.hdslb.com/bfs/archive/1b0ac7eafd51b03a0dc5b2390eec2fbffb25adf7.png","title":"直播","url":"bilibili://live/home","rid":"2036","tab_id":"直播tab"},"2037":{"img":"https://i0.hdslb.com/bfs/archive/e5106aa688dc729e7f0eafcbb80317feb54a43bd.png","title":"推荐","url":"bilibili://pegasus/promo","rid":"2037","tab_id":"推荐tab"},"2280":{"img":"https://github.com/Biliverse/Enhanced/raw/main/src/assets/icon_rounded.png","title":"校园","url":"bilibili://campus/home_tab","rid":"2280","tab_id":"school"},"65539":{"img":"https://i0.hdslb.com/bfs/app/d648ca9614551a053f7d67418d9301da3cacd56d.png","title":"游戏中心","url":"bilibili://game_center?from=category","rid":"65539","tab_id":"65539"},"65541":{"img":"https://i0.hdslb.com/bfs/app/8af80abfd90d70c2293ebce415f52c758f3168c2.png","title":"专栏","url":"bilibili://article/category/","rid":"65541","tab_id":"65541"},"65545":{"img":"https://i0.hdslb.com/bfs/app/616d1ac7ed04973eb0a2ee2621f2aaa9957b486f.png","title":"放映厅","url":"bilibili://pgc/cinema","rid":"65545","tab_id":"65545"},"65549":{"img":"https://i0.hdslb.com/bfs/app/63c39b588dec93c46c2452941c8d19600d5ae428.png","title":"工房集市","url":"https://mall.bilibili.com/neul-next/index.html?page=mall-up_market&noTitleBar=1&msource=js_subarea","rid":"65549","tab_id":"65549"},"65550":{"img":"https://i0.hdslb.com/bfs/app/2a6993417a39de6757db4f97bf80265fc5222112.png","title":"游戏赛事","url":"https://www.bilibili.com/h5/match/data/home?navhide=1","rid":"65550","tab_id":"65550"},"65551":{"img":"https://i0.hdslb.com/bfs/app/8417230e12b25e67b76f503acc58fd215ce812d0.png","title":"小黑屋","url":"https://www.bilibili.com/blackroom","rid":"65551","tab_id":"65551"},"65552":{"img":"https://i0.hdslb.com/bfs/app/b1f1f105479640fd9a8d9f80286dcb76c59230b5.png","title":"全区排行榜","url":"bilibili://rank/","rid":"65552","tab_id":"65552"},"65555":{"img":"https://i0.hdslb.com/bfs/app/e52ed0d89fb326a362d9b7d59a4140ddb2d15221.png","title":"漫画","url":"bilibili://comic/home?from=manga_channel","rid":"65555","tab_id":"65555"},"65560":{"img":"https://i0.hdslb.com/bfs/app/f918bfbeaffca05a0d92f158ccc9dd251e33d467.png","title":"课堂","url":"https://m.bilibili.com/cheese/home?navhide=1&native.theme=1&night=0&spm_id_from=traffic.channel-square-category.0.0&csource=Channel_class","rid":"65560","tab_id":"65560"},"65563":{"img":"https://i0.hdslb.com/bfs/app/5f955448513c0179ac61ea40d82c4ad20ede22c5.png","title":"新歌热榜","url":"https://music.bilibili.com/h5/music-center?-Abrowser=live&is_live_webview=1&hybrid_set_header=2","rid":"65563","tab_id":"65563"},"65565":{"img":"https://i0.hdslb.com/bfs/app/093ec78b5a7b363fbdc26cef6381d8911ecd0b22.png","title":"超高清专区","url":"https://www.bilibili.com/blackboard/era/LqwJ5qsaKiEE0yj8.html?auto_media_playback=1","rid":"65565","tab_id":"65565"},"136117":{"img":"https://github.com/Biliverse/Enhanced/raw/main/src/assets/icon_rounded.png","title":"新征程","url":"bilibili://following/home_activity_tab/136117","rid":"136117","tab_id":"165","color":"#DD1225"}}};

const HTTP_REGION_DATA = {"index":[{"tid":1,"reid":0,"name":"动画","logo":"http://i0.hdslb.com/bfs/archive/9b3bb8cfc8d87809ffa409bc65def8d8c3eaf72b.png","goto":"0","param":"","uri":"bilibili://region/1","type":0,"children":[{"tid":24,"reid":1,"name":"MAD·AMV","logo":"","goto":"0","param":"","type":0},{"tid":25,"reid":1,"name":"MMD·3D","logo":"","goto":"0","param":"","type":0},{"tid":27,"reid":1,"name":"综合","logo":"","goto":"0","param":"","type":0},{"tid":47,"reid":1,"name":"短片·手书·配音","logo":"","goto":"0","param":"","type":0},{"tid":210,"reid":1,"name":"手办·模玩","logo":"","goto":"0","param":"","type":0},{"tid":86,"reid":1,"name":"特摄","logo":"","goto":"0","param":"","type":0},{"tid":253,"reid":1,"name":"动漫杂谈","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":3,"reid":0,"name":"音乐","logo":"http://i0.hdslb.com/bfs/archive/3a99c51d00038ced3989686b6f3c49d01aa34207.png","goto":"0","param":"","uri":"bilibili://region/3","type":0,"children":[{"tid":28,"reid":3,"name":"原创音乐","logo":"","goto":"0","param":"","type":0},{"tid":29,"reid":3,"name":"音乐现场","logo":"","goto":"0","param":"","type":0},{"tid":30,"reid":3,"name":"VOCALOID·UTAU","logo":"","goto":"0","param":"","type":0},{"tid":31,"reid":3,"name":"翻唱","logo":"","goto":"0","param":"","type":0},{"tid":59,"reid":3,"name":"演奏","logo":"","goto":"0","param":"","type":0},{"tid":193,"reid":3,"name":"MV","logo":"","goto":"0","param":"","type":0},{"tid":243,"reid":3,"name":"乐评盘点","logo":"","goto":"0","param":"","type":0},{"tid":244,"reid":3,"name":"音乐教学","logo":"","goto":"0","param":"","type":0},{"tid":130,"reid":3,"name":"音乐综合","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":4,"reid":0,"name":"游戏","logo":"http://i0.hdslb.com/bfs/archive/9c88ce1adaecf31e27121bdbb5a29824d655d0a6.png","goto":"0","param":"","uri":"bilibili://region/4","type":0,"children":[{"tid":17,"reid":4,"name":"单机游戏","logo":"","goto":"0","param":"","type":0},{"tid":171,"reid":4,"name":"电子竞技","logo":"http://i0.hdslb.com/bfs/archive/0511bbb27a1f175a91bf34cfd46a8a8303e607bd.png","goto":"0","param":"","type":0},{"tid":172,"reid":4,"name":"手机游戏","logo":"http://i0.hdslb.com/bfs/archive/572945562c8f04437564ba37083f1c2c5ca9432b.png","goto":"0","param":"","type":0},{"tid":65,"reid":4,"name":"网络游戏","logo":"","goto":"0","param":"","type":0},{"tid":173,"reid":4,"name":"桌游棋牌","logo":"http://i0.hdslb.com/bfs/archive/95acf71eacc1cf1fa542d0dcbf3480bafaa6005c.png","goto":"0","param":"","type":0},{"tid":121,"reid":4,"name":"GMV","logo":"","goto":"0","param":"","type":0},{"tid":136,"reid":4,"name":"音游","logo":"","goto":"0","param":"","type":0},{"tid":19,"reid":4,"name":"Mugen","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":5,"reid":0,"name":"娱乐","logo":"http://i0.hdslb.com/bfs/archive/a9bcb4cb7e216c2ea28ba3dc10acd2d210f739bd.png","goto":"0","param":"","uri":"bilibili://region/5","type":0,"children":[{"tid":71,"reid":5,"name":"综艺","logo":"","goto":"0","param":"","type":0},{"tid":241,"reid":5,"name":"娱乐杂谈","logo":"","goto":"0","param":"","type":0},{"tid":242,"reid":5,"name":"粉丝创作","logo":"","goto":"0","param":"","type":0},{"tid":137,"reid":5,"name":"明星综合","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":11,"reid":0,"name":"电视剧","logo":"http://i0.hdslb.com/bfs/archive/30779a6904875754762e666b7076014528ef4834.png","goto":"0","param":"","uri":"bilibili://pgc/cinema/tv","type":0,"is_bangumi":1,"children":[{"tid":185,"reid":11,"name":"国产剧","logo":"","goto":"0","param":"","type":0},{"tid":187,"reid":11,"name":"海外剧","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":11,"reid":0,"name":"电视剧","logo":"http://i0.hdslb.com/bfs/archive/30779a6904875754762e666b7076014528ef4834.png","goto":"0","param":"","uri":"bilibili://pgc/partition_page?page_name=tv-operation&title=%E7%94%B5%E8%A7%86%E5%89%A7&select_id=1","type":0,"is_bangumi":1,"children":[{"tid":185,"reid":11,"name":"国产剧","logo":"","goto":"0","param":"","type":0},{"tid":187,"reid":11,"name":"海外剧","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":13,"reid":0,"name":"番剧","logo":"http://i0.hdslb.com/bfs/archive/6f629bd0dcd71d7b9911803f8e4f94fd0e5b4bfd.png","goto":"0","param":"","uri":"bilibili://pgc/partition_page?page_name=bangumi-operation&title=%E7%95%AA%E5%89%A7&select_id=1","type":1,"is_bangumi":1,"children":[{"tid":33,"reid":13,"name":"连载动画","logo":"http://i0.hdslb.com/bfs/archive/02c1ddbe698c4cba3c6db941047957d17b7910d7.png","goto":"0","param":"","type":0},{"tid":32,"reid":13,"name":"完结动画","logo":"http://i0.hdslb.com/bfs/archive/efb691127ea5b547b64431a59b27b278d6803172.png","goto":"0","param":"","type":0},{"tid":51,"reid":13,"name":"资讯","logo":"","goto":"0","param":"","type":0},{"tid":152,"reid":13,"name":"官方延伸","logo":"http://i0.hdslb.com/bfs/archive/8eb0bf53223544526bf99ec6f636758e2afed503.png","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"top"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":13,"reid":0,"name":"番剧","logo":"http://i0.hdslb.com/bfs/archive/6f629bd0dcd71d7b9911803f8e4f94fd0e5b4bfd.png","goto":"0","param":"","uri":"bilibili://pgc/bangumi","type":0,"is_bangumi":1,"children":[{"tid":33,"reid":13,"name":"连载动画","logo":"http://i0.hdslb.com/bfs/archive/02c1ddbe698c4cba3c6db941047957d17b7910d7.png","goto":"0","param":"","type":0},{"tid":32,"reid":13,"name":"完结动画","logo":"http://i0.hdslb.com/bfs/archive/efb691127ea5b547b64431a59b27b278d6803172.png","goto":"0","param":"","type":0},{"tid":51,"reid":13,"name":"资讯","logo":"","goto":"0","param":"","type":0},{"tid":152,"reid":13,"name":"官方延伸","logo":"http://i0.hdslb.com/bfs/archive/8eb0bf53223544526bf99ec6f636758e2afed503.png","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"top"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":13,"reid":0,"name":"番劇","logo":"http://i0.hdslb.com/bfs/archive/6f629bd0dcd71d7b9911803f8e4f94fd0e5b4bfd.png","goto":"0","param":"","uri":"bilibili://pgc/bangumi","type":1,"is_bangumi":1,"config":[{"scenes_name":"region","scenes_type":"top"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":23,"reid":0,"name":"电影","logo":"http://i0.hdslb.com/bfs/archive/137edde9deb7dfcdf610ed2d1ec63bae6ef3ba0a.png","goto":"0","param":"","uri":"bilibili://pgc/cinema/movie","type":0,"is_bangumi":1,"children":[{"tid":147,"reid":23,"name":"华语电影","logo":"","goto":"0","param":"","type":0},{"tid":145,"reid":23,"name":"欧美电影","logo":"","goto":"0","param":"","type":0},{"tid":146,"reid":23,"name":"日本电影","logo":"","goto":"0","param":"","type":0},{"tid":83,"reid":23,"name":"其他国家","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":36,"reid":0,"name":"知识","logo":"http://i0.hdslb.com/bfs/archive/d5bb279936dbe661f958683231566214056987b2.png","goto":"0","param":"","uri":"bilibili://region/36","type":0,"children":[{"tid":39,"reid":36,"name":"演講·公開課","logo":"","goto":"0","param":"","type":0},{"tid":95,"reid":36,"name":"數碼","logo":"","goto":"0","param":"","type":0},{"tid":98,"reid":36,"name":"機械","logo":"","goto":"0","param":"","type":0},{"tid":122,"reid":36,"name":"野生技能协会","logo":"","goto":"0","param":"","type":0},{"tid":124,"reid":36,"name":"社科·法律·心理","logo":"","goto":"0","param":"","type":0},{"tid":201,"reid":36,"name":"科学科普","logo":"","goto":"0","param":"","type":0},{"tid":207,"reid":36,"name":"财经商业","logo":"","goto":"0","param":"","type":0},{"tid":208,"reid":36,"name":"校园学习","logo":"","goto":"0","param":"","type":0},{"tid":209,"reid":36,"name":"职业职场","logo":"","goto":"0","param":"","type":0},{"tid":228,"reid":36,"name":"人文历史","logo":"","goto":"0","param":"","type":0},{"tid":229,"reid":36,"name":"设计·创意","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":119,"reid":0,"name":"鬼畜","logo":"http://i0.hdslb.com/bfs/archive/de50290b11c65108eb70766fa887032b948d2e4b.png","goto":"0","param":"","uri":"bilibili://region/119","type":0,"children":[{"tid":22,"reid":119,"name":"鬼畜调教","logo":"","goto":"0","param":"","type":0},{"tid":26,"reid":119,"name":"音MAD","logo":"","goto":"0","param":"","type":0},{"tid":126,"reid":119,"name":"人力VOCALOID","logo":"","goto":"0","param":"","type":0},{"tid":127,"reid":119,"name":"教程演示","logo":"","goto":"0","param":"","type":0},{"tid":216,"reid":119,"name":"鬼畜剧场","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":129,"reid":0,"name":"舞蹈","logo":"http://i0.hdslb.com/bfs/archive/4769a6faa9ccfde4a029eca36b979bac486afd14.png","goto":"0","param":"","uri":"bilibili://region/129","type":0,"children":[{"tid":20,"reid":129,"name":"宅舞","logo":"","goto":"0","param":"","type":0},{"tid":154,"reid":129,"name":"舞蹈综合","logo":"","goto":"0","param":"","type":0},{"tid":156,"reid":129,"name":"舞蹈教程","logo":"http://i0.hdslb.com/bfs/archive/c4a42b0d7df5e4eed9fa0980445f45fff6903c5c.png","goto":"0","param":"","type":0},{"tid":198,"reid":129,"name":"街舞","logo":"","goto":"0","param":"","type":0},{"tid":199,"reid":129,"name":"明星舞蹈","logo":"","goto":"0","param":"","type":0},{"tid":200,"reid":129,"name":"国风舞蹈","logo":"","goto":"0","param":"","type":0},{"tid":255,"reid":129,"name":"手势·网红舞","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":155,"reid":0,"name":"时尚","logo":"http://i0.hdslb.com/bfs/archive/1842562be5ded346d79312b24fafedbc1d78c8e2.png","goto":"0","param":"","uri":"bilibili://region/155","type":0,"children":[{"tid":157,"reid":155,"name":"美妆护肤","logo":"http://i0.hdslb.com/bfs/archive/3f6d8cc081e5dd413eda83527b5ca91fa51f5891.png","goto":"0","param":"","type":0},{"tid":158,"reid":155,"name":"穿搭","logo":"http://i0.hdslb.com/bfs/archive/5df77c1b13f20af22ec9f595f6a83f8b65d469a0.png","goto":"0","param":"","type":0},{"tid":159,"reid":155,"name":"时尚潮流","logo":"http://i0.hdslb.com/bfs/archive/5d5767ed736a2808e7bf9e74a58f1eb5eea963cd.png","goto":"0","param":"","type":0},{"tid":164,"reid":155,"name":"健身","logo":"http://i0.hdslb.com/bfs/archive/c5da2d170056227118594ab2c70d40ad9d0eed5c.png","goto":"0","param":"","type":0},{"tid":252,"reid":155,"name":"仿妆cos","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":160,"reid":0,"name":"生活","logo":"http://i0.hdslb.com/bfs/archive/50731fc4b9ec487ef2e3861a97e0eb4671b7bcef.png","goto":"0","param":"","uri":"bilibili://region/160","type":0,"children":[{"tid":21,"reid":160,"name":"日常","logo":"","goto":"0","param":"","type":0},{"tid":75,"reid":160,"name":"動物圈","logo":"","goto":"0","param":"","type":0},{"tid":76,"reid":160,"name":"美食圈","logo":"","goto":"0","param":"","type":0},{"tid":138,"reid":160,"name":"搞笑","logo":"","goto":"0","param":"","type":0},{"tid":161,"reid":160,"name":"手工","logo":"http://i0.hdslb.com/bfs/archive/f87bb34913e8f7eeef216aba813961c47117e783.png","goto":"0","param":"","type":0},{"tid":162,"reid":160,"name":"绘画","logo":"http://i0.hdslb.com/bfs/archive/e6b66a76eb07f2acffd00b8f8c1cc0ff57e75e53.png","goto":"0","param":"","type":0},{"tid":163,"reid":160,"name":"運動","logo":"http://i0.hdslb.com/bfs/archive/e6b66a76eb07f2acffd00b8f8c1cc0ff57e75e53.png","goto":"0","param":"","type":0},{"tid":250,"reid":160,"name":"出行","logo":"","goto":"0","param":"","type":0},{"tid":251,"reid":160,"name":"三农","logo":"","goto":"0","param":"","type":0},{"tid":239,"reid":160,"name":"家居房产","logo":"","goto":"0","param":"","type":0},{"tid":254,"reid":160,"name":"亲子","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":167,"reid":0,"name":"国创","logo":"http://i0.hdslb.com/bfs/archive/1586ec926eac1ea876cb74d32df51394d8e72341.png","goto":"0","param":"","uri":"bilibili://pgc/partition_page?page_name=gc-operation&title=%E5%9B%BD%E5%88%9B&select_id=1","type":1,"is_bangumi":1,"children":[{"tid":153,"reid":167,"name":"国产动画","logo":"","goto":"0","param":"","type":0},{"tid":168,"reid":167,"name":"国产原创相关","logo":"","goto":"0","param":"","type":0},{"tid":169,"reid":167,"name":"布袋戏","logo":"","goto":"0","param":"","type":0},{"tid":195,"reid":167,"name":"动态漫·广播剧","logo":"","goto":"0","param":"","type":0},{"tid":170,"reid":167,"name":"资讯","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"top"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":167,"reid":0,"name":"国创","logo":"http://i0.hdslb.com/bfs/archive/1586ec926eac1ea876cb74d32df51394d8e72341.png","goto":"0","param":"","uri":"bilibili://pgc/domestic","type":0,"is_bangumi":1,"children":[{"tid":153,"reid":167,"name":"国产动画","logo":"","goto":"0","param":"","type":0},{"tid":168,"reid":167,"name":"国产原创相关","logo":"","goto":"0","param":"","type":0},{"tid":169,"reid":167,"name":"布袋戏","logo":"","goto":"0","param":"","type":0},{"tid":195,"reid":167,"name":"动态漫·广播剧","logo":"","goto":"0","param":"","type":0},{"tid":170,"reid":167,"name":"资讯","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"top"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":167,"reid":0,"name":"國創","logo":"http://i0.hdslb.com/bfs/archive/1586ec926eac1ea876cb74d32df51394d8e72341.png","goto":"0","param":"","uri":"bilibili://pgc/domestic","type":1,"is_bangumi":1,"config":[{"scenes_name":"region","scenes_type":"top"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":177,"reid":0,"name":"纪录片","logo":"http://i0.hdslb.com/bfs/archive/884a644c6bb4b8bb16f9746ef35fbaba396e0b8c.png","goto":"0","param":"","uri":"bilibili://pgc/partition_page?page_name=documentary-operation&title=%E7%BA%AA%E5%BD%95%E7%89%87&select_id=1","type":1,"children":[{"tid":37,"reid":177,"name":"人文·历史","logo":"","goto":"0","param":"","type":0},{"tid":178,"reid":177,"name":"科学·探索·自然","logo":"","goto":"0","param":"","type":0},{"tid":179,"reid":177,"name":"军事","logo":"","goto":"0","param":"","type":0},{"tid":180,"reid":177,"name":"社会·美食·旅行","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"top"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":177,"reid":0,"name":"纪录片","logo":"http://i0.hdslb.com/bfs/archive/884a644c6bb4b8bb16f9746ef35fbaba396e0b8c.png","goto":"0","param":"","uri":"bilibili://pgc/cinema/doc","type":0,"children":[{"tid":37,"reid":177,"name":"人文·历史","logo":"","goto":"0","param":"","type":0},{"tid":178,"reid":177,"name":"科学·探索·自然","logo":"","goto":"0","param":"","type":0},{"tid":179,"reid":177,"name":"军事","logo":"","goto":"0","param":"","type":0},{"tid":180,"reid":177,"name":"社会·美食·旅行","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"},{"scenes_name":"region","scenes_type":"top"}]},{"tid":181,"reid":0,"name":"影视","logo":"http://i0.hdslb.com/bfs/archive/f90bb1ef59630ad9765486c6088a4944b96e88a3.png","goto":"0","param":"","uri":"bilibili://region/181","type":0,"children":[{"tid":182,"reid":181,"name":"影视杂谈","logo":"","goto":"0","param":"","type":0},{"tid":183,"reid":181,"name":"影视剪辑","logo":"","goto":"0","param":"","type":0},{"tid":85,"reid":181,"name":"小剧场","logo":"","goto":"0","param":"","type":0},{"tid":184,"reid":181,"name":"预告·资讯","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":188,"reid":0,"name":"科技","logo":"http://i0.hdslb.com/bfs/feed-admin/4a687a86b49feea68d423fd1bf2c461acfe59b70.png","goto":"0","param":"","uri":"bilibili://region/188","type":0,"children":[{"tid":95,"reid":188,"name":"数码","logo":"","goto":"0","param":"","type":0},{"tid":230,"reid":188,"name":"软件应用","logo":"","goto":"0","param":"","type":0},{"tid":231,"reid":188,"name":"计算机技术","logo":"","goto":"0","param":"","type":0},{"tid":232,"reid":188,"name":"科工机械","logo":"","goto":"0","param":"","type":0},{"tid":233,"reid":188,"name":"极客DIY","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"},{"scenes_name":"attention"}]},{"tid":202,"reid":0,"name":"资讯","logo":"https://i0.hdslb.com/bfs/legacy/d71e70e1bfcb7b27ffe88e6cb82868c68b084464.png","goto":"0","param":"","uri":"bilibili://region/202","type":0,"children":[{"tid":203,"reid":202,"name":"热点","logo":"","goto":"0","param":"","type":0},{"tid":204,"reid":202,"name":"环球","logo":"","goto":"0","param":"","type":0},{"tid":205,"reid":202,"name":"社会","logo":"","goto":"0","param":"","type":0},{"tid":206,"reid":202,"name":"综合","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"search"},{"scenes_name":"tag"},{"scenes_name":"attention"}]},{"tid":211,"reid":0,"name":"美食","logo":"http://i0.hdslb.com/bfs/feed-admin/0f5e21f08616f9c02d706433ba1c00bd5b889c7b.png","goto":"0","param":"","uri":"bilibili://region/211","type":0,"children":[{"tid":76,"reid":211,"name":"美食制作","logo":"","goto":"0","param":"","type":0},{"tid":212,"reid":211,"name":"美食侦探","logo":"","goto":"0","param":"","type":0},{"tid":213,"reid":211,"name":"美食测评","logo":"","goto":"0","param":"","type":0},{"tid":214,"reid":211,"name":"田园美食","logo":"","goto":"0","param":"","type":0},{"tid":215,"reid":211,"name":"美食记录","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":217,"reid":0,"name":"动物圈","logo":"http://i0.hdslb.com/bfs/feed-admin/9f3303b20e12ac874c379da09bca9ce4d0b2f88c.png","goto":"0","param":"","uri":"bilibili://region/217","type":0,"children":[{"tid":218,"reid":217,"name":"喵星人","logo":"","goto":"0","param":"","type":0},{"tid":219,"reid":217,"name":"汪星人","logo":"","goto":"0","param":"","type":0},{"tid":222,"reid":217,"name":"小宠异宠","logo":"","goto":"0","param":"","type":0},{"tid":221,"reid":217,"name":"野生动物","logo":"","goto":"0","param":"","type":0},{"tid":220,"reid":217,"name":"动物二创","logo":"","goto":"0","param":"","type":0},{"tid":75,"reid":217,"name":"动物综合","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"search"},{"scenes_name":"rank"},{"scenes_name":"tag"}]},{"tid":223,"reid":0,"name":"汽车","logo":"http://i0.hdslb.com/bfs/feed-admin/1515d944550494abf81b552a84484dce80287242.png","goto":"0","param":"","uri":"bilibili://region/223","type":0,"children":[{"tid":245,"reid":223,"name":"赛车","logo":"","goto":"0","param":"","type":0},{"tid":246,"reid":223,"name":"改装玩车","logo":"","goto":"0","param":"","type":0},{"tid":247,"reid":223,"name":"新能源车","logo":"","goto":"0","param":"","type":0},{"tid":248,"reid":223,"name":"房车","logo":"","goto":"0","param":"","type":0},{"tid":240,"reid":223,"name":"摩托车","logo":"","goto":"0","param":"","type":0},{"tid":227,"reid":223,"name":"购车攻略","logo":"","goto":"0","param":"","type":0},{"tid":176,"reid":223,"name":"汽车生活","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":234,"reid":0,"name":"运动","logo":"http://i0.hdslb.com/bfs/feed-admin/56a67fa38d8d7378ab4154307d26cffce2d1ae3f.png","goto":"0","param":"","uri":"bilibili://region/234","type":0,"children":[{"tid":235,"reid":234,"name":"篮球","logo":"","goto":"0","param":"","type":0},{"tid":249,"reid":234,"name":"足球","logo":"","goto":"0","param":"","type":0},{"tid":164,"reid":234,"name":"健身","logo":"","goto":"0","param":"","type":0},{"tid":236,"reid":234,"name":"竞技体育","logo":"","goto":"0","param":"","type":0},{"tid":237,"reid":234,"name":"运动文化","logo":"","goto":"0","param":"","type":0},{"tid":238,"reid":234,"name":"运动综合","logo":"","goto":"0","param":"","type":0}],"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"rank"},{"scenes_name":"search"},{"scenes_name":"tag"}]},{"tid":65537,"reid":0,"name":"直播","logo":"http://i0.hdslb.com/bfs/archive/1b0ac7eafd51b03a0dc5b2390eec2fbffb25adf7.png","goto":"0","param":"","uri":"bilibili://home/?tab=直播","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65539,"reid":0,"name":"游戏中心","logo":"http://i0.hdslb.com/bfs/archive/656df3124c81dd0e19bdc0a3e017091268b3db73.jpg","goto":"0","param":"","uri":"bilibili://game_center","type":1,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65541,"reid":0,"name":"专栏","logo":"http://i0.hdslb.com/bfs/archive/a0c0e133644c47d6263cf24cf8364e2106c102c3.png","goto":"0","param":"","uri":"bilibili://article/category/","type":1,"config":[{"scenes_name":"region","scenes_type":"bottom"},{"scenes_name":"search"}]},{"tid":65541,"reid":0,"name":"专栏","logo":"http://i0.hdslb.com/bfs/archive/a0c0e133644c47d6263cf24cf8364e2106c102c3.png","goto":"0","param":"","uri":"bilibili://article/category/","type":0,"config":[{"scenes_name":"region","scenes_type":"top"}]},{"tid":65545,"reid":0,"name":"放映厅","logo":"http://i0.hdslb.com/bfs/archive/3dfba664353bb2349917eaf81b60db34b2d4c61a.png","goto":"0","param":"","uri":"bilibili://pgc/cinema","type":1,"config":[{"scenes_name":"region","scenes_type":"top"}]},{"tid":65549,"reid":0,"name":"工房集市","logo":"http://i0.hdslb.com/bfs/feed-admin/d89a76f987820ffa3c7d5c62789ebd784c68ac07.png","goto":"0","param":"","uri":"https://mall.bilibili.com/neul-next/index.html?page=mall-up_market&noTitleBar=1&msource=js_subarea","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65550,"reid":0,"name":"游戏赛事","logo":"http://i0.hdslb.com/bfs/archive/a93687a7f29da88ee375109389b0634412847bd1.png","goto":"0","param":"","uri":"https://www.bilibili.com/h5/match/data/home?navhide=1","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65550,"reid":0,"name":"遊戲賽事","logo":"http://i0.hdslb.com/bfs/archive/a93687a7f29da88ee375109389b0634412847bd1.png","goto":"0","param":"","uri":"https://www.bilibili.com/h5/game/home?navhide=1","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65551,"reid":0,"name":"小黑屋","logo":"http://i0.hdslb.com/bfs/archive/ed4f676e8c1f1029b8e37e2f567875b682e632ce.png","goto":"0","param":"","uri":"https://www.bilibili.com/blackroom","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65552,"reid":0,"name":"全区排行榜","logo":"http://i0.hdslb.com/bfs/archive/34f46c749054b1c3c157b0c1c09a5ef2b3539204.png","goto":"0","param":"","uri":"bilibili://rank/","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65553,"reid":0,"name":"活动中心","logo":"http://i0.hdslb.com/bfs/archive/3e2e6d338aa8156dc6f63c5dc8c75ed298c5cc9a.png","goto":"0","param":"","uri":"bilibili://activity_center/","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65555,"reid":0,"name":"漫画","logo":"http://i0.hdslb.com/bfs/archive/d260e72fb98251dabe4f64858f65cc697a71587e.png","goto":"0","param":"","uri":"bilibili://comic/home?from=manga_channel","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65555,"reid":0,"name":"漫画","logo":"http://i0.hdslb.com/bfs/archive/d260e72fb98251dabe4f64858f65cc697a71587e.png","goto":"0","param":"","uri":"bilibili://comic/home?from=ipadmanga_channel","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65556,"reid":0,"name":"原創排行榜","logo":"http://i0.hdslb.com/bfs/archive/5f232dbcb590e81dbd3dab6d2c906cff70547841.png","goto":"0","param":"","uri":"bilibili://rank?type=original","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65557,"reid":0,"name":"公开课","logo":"http://i0.hdslb.com/bfs/feed-admin/99366a6ea47d7790f57699112bc1d0c6d5f0d302.png","goto":"0","param":"","uri":"https://www.bilibili.com/h5/mooc?navhide=1","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65559,"reid":0,"name":"VLOG","logo":"http://i0.hdslb.com/bfs/archive/c794e8220a8cbe3d83b83e76e753c57df67b036a.png","goto":"0","param":"","uri":"https://www.bilibili.com/h5/vlog?from=2","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65560,"reid":0,"name":"课堂","logo":"http://i0.hdslb.com/bfs/archive/7400e63e28ab9933a3fa8adb3bd63e3a20911641.png","goto":"0","param":"","uri":"https://m.bilibili.com/cheese/home?navhide=1","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65561,"reid":0,"name":"专题中心","logo":"http://i0.hdslb.com/bfs/archive/5c15009ace7f8bbb22c5b46cee3995525bbd9ed0.png","goto":"0","param":"","uri":"bilibili://topic/","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":65563,"reid":0,"name":"新歌热榜","logo":"http://i0.hdslb.com/bfs/archive/518ba4a46b8ca94c0f29397e09acb345020fb867.png","goto":"0","param":"","uri":"https://www.bilibili.com/h5/musicplus?navhide=1","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]}],"modify":[{"tid":6544,"reid":0,"name":"番劇(港澳台)","logo":"http://i0.hdslb.com/bfs/archive/6f629bd0dcd71d7b9911803f8e4f94fd0e5b4bfd.png","goto":"0","param":"","uri":"bilibili://following/home_bottom_tab_activity_tab/6544","type":0,"is_bangumi":1,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":95636,"reid":0,"name":"韩综(港澳台)","logo":"http://i0.hdslb.com/bfs/archive/a9bcb4cb7e216c2ea28ba3dc10acd2d210f739bd.png","goto":"0","param":"","uri":"bilibili://following/home_bottom_tab_activity_tab/95636","type":0,"is_bangumi":1,"config":[{"scenes_name":"region","scenes_type":"bottom"}]},{"tid":168312,"reid":0,"name":"節目(港澳台)","logo":"http://i0.hdslb.com/bfs/archive/f90bb1ef59630ad9765486c6088a4944b96e88a3.png","goto":"0","param":"","uri":"bilibili://following/home_bottom_tab_activity_tab/168312","type":0,"config":[{"scenes_name":"region","scenes_type":"bottom"}]}]};

// --- 合并与构建工具 ---
function buildBuiltinContents() {
    return REGION_LIST_CONFIG.groups.map(g => ({
        title: g.title,
        icons: g.ids.map(id => {
            const item = REGION_LIST_CONFIG.items[id];
            return {
                img: item.img,
                title: item.title,
                url: item.url,
                uniqueId: String(id),
                rid: String(item.rid || 0)
            };
        })
    }));
}

function buildShortcutIcons() {
    return REGION_LIST_CONFIG.defaultShortcut.map(id => {
        const item = REGION_LIST_CONFIG.items[id];
        return {
            img: item.img,
            title: item.title,
            url: item.url,
            uniqueId: String(id),
            rid: String(item.rid || 0)
        };
    });
}

function mergeRegionContents(existingContents) {
    if (!existingContents || existingContents.length === 0) {
        return buildBuiltinContents();
    }
    const groupMap = new Map();
    const existingIds = new Set();

    for (const c of existingContents) {
        groupMap.set(c.title, { title: c.title, icons: [...(c.icons || [])] });
        for (const ic of c.icons || []) {
            if (ic.uniqueId) existingIds.add(String(ic.uniqueId));
        }
    }

    for (const bg of REGION_LIST_CONFIG.groups) {
        let g = groupMap.get(bg.title);
        if (!g) {
            g = { title: bg.title, icons: [] };
            groupMap.set(bg.title, g);
        }
        for (const id of bg.ids) {
            const idStr = String(id);
            if (!existingIds.has(idStr)) {
                const item = REGION_LIST_CONFIG.items[id];
                if (item) {
                    g.icons.push({
                        img: item.img,
                        title: item.title,
                        url: item.url,
                        uniqueId: idStr,
                        rid: String(item.rid || 0)
                    });
                    existingIds.add(idStr);
                }
            }
        }
    }

    const titles = REGION_LIST_CONFIG.groups.map(g => g.title);
    const ordered = titles.map(t => groupMap.get(t)).filter(Boolean);
    const otherTitles = Array.from(groupMap.keys()).filter(t => !titles.includes(t));
    for (const ot of otherTitles) {
        ordered.push(groupMap.get(ot));
    }
    return ordered;
}

// --- 运行时路由入口 ---
const url = (typeof $request !== 'undefined' && $request.url) ? $request.url : '';

if (url.includes('bilibili.app.show.v1.Mixture/RegionList')) {
    // 1. 处理 gRPC 分区列表
    try {
        let rawPayload = null;
        if (typeof $response !== 'undefined' && $response.body) {
            rawPayload = unwrapGrpc($response.body);
        }
        let mergedContents;
        if (rawPayload && rawPayload.length > 0) {
            const decoded = decodeRegionListReply(rawPayload);
            mergedContents = mergeRegionContents(decoded.contents);
        } else {
            mergedContents = buildBuiltinContents();
        }

        const replyObj = {
            shortcut: {
                title: '自定义标签页',
                icons: buildShortcutIcons()
            },
            contents: mergedContents
        };

        const outPayload = encodeRegionListReply(replyObj);
        const finalGrpcBody = wrapGrpc(outPayload);
        const grpcHeaders = {
            'Content-Type': 'application/grpc',
            'grpc-status': '0',
            'grpc-message': '',
            'bili-status-code': '0'
        };

        $done({
            status: 200,
            headers: grpcHeaders,
            body: finalGrpcBody,
            response: {
                status: 200,
                headers: grpcHeaders,
                body: finalGrpcBody
            }
        });
    } catch (err) {
        const replyObj = {
            shortcut: { title: '自定义标签页', icons: buildShortcutIcons() },
            contents: buildBuiltinContents()
        };
        const finalGrpcBody = wrapGrpc(encodeRegionListReply(replyObj));
        const grpcHeaders = {
            'Content-Type': 'application/grpc',
            'grpc-status': '0'
        };
        $done({
            status: 200,
            headers: grpcHeaders,
            body: finalGrpcBody,
            response: {
                status: 200,
                headers: grpcHeaders,
                body: finalGrpcBody
            }
        });
    }
} else if (url.includes('bilibili.app.show.v1.Mixture/RegionShortcut')) {
    // 2. 快捷方式保存请求拦截确认
    const grpcHeaders = {
        'Content-Type': 'application/grpc',
        'grpc-status': '0',
        'grpc-message': '',
        'bili-status-code': '0'
    };
    $done({
        status: 200,
        headers: grpcHeaders,
        response: {
            status: 200,
            headers: grpcHeaders
        }
    });
} else if (url.includes('/x/resource/show/tab/v2')) {
    // 3. 首页 Tab 与顶栏入口重定向：确保右上角分类入口必定唤起新版卡片分区页面 (bilibili://main/top_category)
    try {
        let bodyStr = (typeof $response !== 'undefined' && $response.body) ? $response.body : '{}';
        if (typeof bodyStr !== 'string') {
            bodyStr = (typeof Buffer !== 'undefined') ? Buffer.from(bodyStr).toString('utf8') : new TextDecoder().decode(bodyStr);
        }
        const resJson = JSON.parse(bodyStr || '{}');
        if (resJson && resJson.data) {
            let topMore = resJson.data.top_more || [];
            let catItem = topMore.find(item => item.id === 'categories');
            if (catItem) {
                catItem.uri = 'bilibili://main/top_category';
            } else {
                topMore.push({
                    id: 'categories',
                    icon: 'http://i0.hdslb.com/bfs/feed-admin/f95dfa31c793c857af6e7b65b5387a05f30d31ba.png',
                    name: '更多分区',
                    uri: 'bilibili://main/top_category',
                    tab_id: '更多分区TopMore',
                    pos: topMore.length + 1
                });
            }
            resJson.data.top_more = topMore;
            const updatedBody = JSON.stringify(resJson);
            $done({
                body: updatedBody,
                response: {
                    status: 200,
                    headers: { 'Content-Type': 'application/json; charset=utf-8' },
                    body: updatedBody
                }
            });
        } else {
            $done({});
        }
    } catch (e) {
        $done({});
    }
} else if (url.includes('/x/v2/region/index') || url.includes('/x/v2/channel/region/list')) {
    // 4. 处理 HTTP 旧版/降级分区接口
    let list = JSON.parse(JSON.stringify(HTTP_REGION_DATA.index || []));
    if (HTTP_REGION_DATA.modify && HTTP_REGION_DATA.modify.length > 0) {
        list.push(...JSON.parse(JSON.stringify(HTTP_REGION_DATA.modify)));
    }
    const seen = new Set();
    list = list.filter(item => {
        if (seen.has(item.tid)) return false;
        seen.add(item.tid);
        return true;
    }).sort((a, b) => a.tid - b.tid);

    if (url.includes('/x/v2/channel/region/list')) {
        list = list.map(item => {
            if (item.goto === '0') item.goto = '';
            delete item.children;
            delete item.config;
            return item;
        });
    }

    const respBody = JSON.stringify({
        code: 0,
        message: '0',
        ttl: 1,
        data: list
    });

    $done({
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*'
        },
        body: respBody,
        response: {
            status: 200,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'access-control-allow-origin': '*'
            },
            body: respBody
        }
    });
} else {
    $done({});
}

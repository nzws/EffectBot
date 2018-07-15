let config = require('./config');
let fetch = require('node-fetch');

// 埋め埋め
const { createCanvas, loadImage } = require('canvas');
const request = require('request');
const fs = require('fs');

let lang = {};
lang["en"] = require('./data/talk_sys/en');

var effect = require('effect');
var { JSDOM } = require('jsdom');

let was_check = {};



if (!config.domain || !config.token ||
    !config.bot_id || !config.bot_admin ||
    !config.post_privacy) {
    console.log("ERROR!:config情報が不足しています！");
    process.exit();
}

function reConnect(mode) {
    console.log('サーバとの接続が切れました。60秒後にリトライします...');
    save(true);
    setTimeout(function () {
        StartAkariBot(mode);
    }, 60000);
}

function Start() {
    let mi = 0, m = ["user"];
    while (m[mi]) {
        StartAkariBot(m[mi]);
        mi++;
    }
}

function StartAkariBot(mode) {
    let WebSocketClient = require('websocket').client;
    let client = new WebSocketClient();

    client.on('connectFailed', function (error) {
        console.log('Connect Error: ' + error.toString());
        reConnect(mode);
    });

    client.on('connect', function (connection) {
        console.log('WebSocket Client Connected');
        connection.on('error', function (error) {
            console.log("Connection Error: " + error.toString());
            reConnect(mode);
        });
        connection.on('close', function () {
            reConnect(mode);
            //鯖落ち
        });
        connection.on('message', function (message) {
            //console.log(message);
            try {
                if (message.type === 'utf8') {
                    let ord = JSON.parse(message.utf8Data);
                    let json = JSON.parse(ord.payload);

                    if (ord.event === "notification") {
                        if (json["type"] === "follow" && json["account"]["id"]) {
                            follow(json["account"]["id"]);
                            return;
                        }
                        if (json["type"] !== "mention") {
                            return;
                        } else {
                            json = json["status"];
                        }
                    }

                    if (json['visibility'] !== 'public' && json['visibility'] !== config.post_privacy && json['visibility'] !== 'unlisted') return;
                    if (json['reblog']) return;

                    if (was_check[json['id']]) return; //HTLとLTLの重複防止
                    was_check[json['id']] = true;

                    let acct = json['account']['acct'];
                    let text = json['content'];
                    if (acct !== config.bot_id) {
                        //メイン部分
                        if (text.match(/(!effect)/i)) {
                            //rt(json['id']);
                            var imagetype = ".png";
                            if (json['mentions'][0]) {
                                if (json['mentions'][1] && json['mentions'][0]["username"] !== "EffectBot") {
                                    post("@" + acct + " " + lang["en"].lang[0], { in_reply_to_id: json['id'] }, "direct");
                                } else {
                                    if (json['mentions'][0]["username"] === "EffectBot" && json['mentions'][1]) {
                                        json['mentions'][0] = json['mentions'][1];
                                    }
                                    fetch("https://" + config.domain + "/api/v1/accounts/" + json['mentions'][0]["id"], {
                                        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + config.token },
                                        method: 'GET'
                                    }).then(function (response) {
                                        if (response.ok) {
                                            return response.json();
                                        } else {
                                            console.warn("NG:USERGET_EFFECT:SERVER");
                                            return null;
                                        }
                                    }).then(function (jsoni) {
                                        if (jsoni) {
                                            if (jsoni["id"]) {
                                                request({
                                                    method: 'GET',
                                                    url: jsoni["avatar_static"],
                                                    encoding: null
                                                },
                                                    function (error, response, blob) {
                                                        if (!error && response.statusCode === 200) {
                                                            console.log("OK:IMAGEGET_EFFECT:" + acct);
                                                            imagetype = jsoni["avatar_static"].match(/\.(jpeg|jpg|png|gif)/i)[0];
                                                            fs.writeFileSync('data/tmp/effect_user' + json["id"] + imagetype, blob, 'binary');
                                                            image_effect(imagetype, json, (", @" + jsoni["acct"]));
                                                        } else {
                                                            console.warn("NG:IMAGEGET_EFFECT");
                                                        }
                                                    }
                                                );
                                            } else {
                                                console.warn("NG:USERGET_EFFECT:" + jsoni);
                                            }
                                        }
                                    });
                                }
                            } else if (json['media_attachments'][0]) {
                                if (json['media_attachments'][1]) {
                                    post("@" + acct + " " + lang["en"].lang[1], { in_reply_to_id: json['id'] }, "direct");
                                } else {
                                    if (json['media_attachments'][0]["type"] === "image") {
                                        request({
                                            method: 'GET',
                                            url: json['media_attachments'][0]["preview_url"],
                                            encoding: null
                                        },
                                            function (error, response, blob) {
                                                if (!error && response.statusCode === 200) {
                                                    console.log("OK:IMAGEGET_EFFECT:MEDIA");
                                                    imagetype = json['media_attachments'][0]["preview_url"].match(/\.(jpeg|jpg|png|gif)/i)[0];
                                                    fs.writeFileSync('data/tmp/effect_user' + json["id"] + imagetype, blob, 'binary');
                                                    image_effect(imagetype, json);
                                                } else {
                                                    console.warn("NG:IMAGEGET_EFFECT");
                                                }
                                            }
                                        );
                                    } else {
                                        post("@" + acct + " " + lang["en"].lang[2], { in_reply_to_id: json['id'] }, "direct");
                                    }
                                }
                            } else {
                                post("@" + acct + " " + lang["en"].lang[3], { in_reply_to_id: json['id'] }, "direct");
                            }
                        }

                    }
                }
            } catch (e) {
                post("@" + config.bot_admin[0] + " 【エラー検知】\n\n" + e, {}, "direct", true);
            }
        });
    });

    client.connect("wss://" + config.domain + "/api/v1/streaming/?access_token=" + config.token + "&stream=" + mode);
}

Start();

// ここからいろいろ

function image_effect(imagetype, json, addtext = "") {
    console.log(addtext);
    loadImage('data/tmp/effect_user' + json["id"] + imagetype).then((image) => {
        var mode = {};
        if (json['content'].match(/(対照|waaw|反転|シンメトリー)/i)) {
            mode["base"] = "vanila";
            mode["type"] = json['content'].match(/(タイプ2|Type2|モード2|waaw2)/i) ? "waaw2" : "waaw";
        } else if (json['content'].match(/(ブラー|ぼかし|blur)/i)) {
            mode["base"] = "effect";
            mode["type"] = "blur";
        } else if (json['content'].match(/(シャープ|sharpen)/i)) {
            mode["base"] = "effect";
            mode["type"] = "sharpen";
        } else if (json['content'].match(/(アンシャープ|unsharp)/i)) {
            mode["base"] = "effect";
            mode["type"] = "unsharp";
        } else if (json['content'].match(/(threshold)/i)) {
            mode["base"] = "effect";
            mode["type"] = "threshold";
        } else if (json['content'].match(/(油彩|オイルペイント|oilpaint)/i)) {
            mode["base"] = "effect";
            mode["type"] = "oilpaint";
        } else if (json['content'].match(/(メタル|metal)/i)) {
            mode["base"] = "effect";
            mode["type"] = "metal";
        } else if (json['content'].match(/(エッジ|edge)/i)) {
            mode["base"] = "effect";
            mode["type"] = "edge";
        } else if (json['content'].match(/(火|燃や|burn)/i)) {
            mode["base"] = "funia";
            if (json['content'].match(/(写真|photo)/i)) mode["type"] = 12;
            else mode["type"] = json['content'].match(/(タイプ1|Type1|モード1|gif|動)/i) ? 0 : 1;
        } else if (json['content'].match(/(お尋ね|wanted)/i)) {
            mode["base"] = "funia";
            mode["type"] = 2;
        } else if (json['content'].match(/(タトゥー|tattoo)/i)) {
            mode["base"] = "funia";
            mode["type"] = 3;
        } else if (json['content'].match(/(スパイ|シークレット|secret)/i)) {
            mode["base"] = "funia";
            mode["type"] = 4;
        } else if (json['content'].match(/(スクリーン|screen)/i)) {
            mode["base"] = "funia";
            mode["type"] = 5;
        } else if (json['content'].match(/(シャンパン|champagne)/i)) {
            mode["base"] = "funia";
            mode["type"] = 6;
        } else if (json['content'].match(/(トラック|truck)/i)) {
            mode["base"] = "funia";
            mode["type"] = 7;
        } else if (json['content'].match(/(ミュージアム|museum)/i)) {
            mode["base"] = "funia";
            mode["type"] = 8;
        } else if (json['content'].match(/(ドル|dollar)/i)) {
            mode["base"] = "funia";
            mode["type"] = 9;
        } else if (json['content'].match(/(動画|vhs)/i)) {
            mode["base"] = "funia";
            mode["type"] = 10;
        } else if (json['content'].match(/(スケッチ|鉛筆|sketch)/i)) {
            mode["base"] = "funia";
            mode["type"] = 11;
        } else if (json['content'].match(/(花火|スパークラー|sparkler)/i)) {
            mode["base"] = "funia";
            mode["type"] = 13;
        } else if (json['content'].match(/(ギャラリー|gallery)/i)) {
            mode["base"] = "funia";
            mode["type"] = json['content'].match(/(タイプ2|Type2|モード2|ギャラリー2|gallery2)/i) ? 15 : 14;
        } else if (json['content'].match(/(新聞|newspaper)/i)) {
            mode["base"] = "funia";
            mode["type"] = 16;
        } else if (json['content'].match(/(東急プラザ)/i)) {
            mode["base"] = "funia";
            mode["type"] = 17;
        } else if (json['content'].match(/(シャッター|shutters)/i)) {
            mode["base"] = "funia";
            mode["type"] = 18;
        } else if (json['content'].match(/(雷|lightning)/i)) {
            mode["base"] = "funia";
            mode["type"] = 19;
        } else {
            post("@" + acct + " " + lang["en"].lang[4], { in_reply_to_id: json['id'] }, "direct");
            return false;
        }
        var canvas_origin = createCanvas(image.width, image.height)
        var ctx = canvas_origin.getContext('2d');

        if (mode["base"] === "vanila") {
            if (mode["type"] === "waaw") {
                ctx.drawImage(image, 0, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(image, -image.width, 0, -image.width / 2, image.height, 0, 0, -image.width / 2, image.height);
            } else if (mode["type"] === "waaw2") {
                ctx.scale(-1, 1);
                ctx.drawImage(image, -image.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(image, 0, 0, image.width / 2, image.height, 0, 0, image.width / 2, image.height);
            }

            var blobdata = new Buffer((canvas_origin.toDataURL()).split(",")[1], 'base64');
            fs.writeFileSync('data/tmp/effect_result' + json["id"] + imagetype, blobdata, 'binary');
            post_upimg("@" + json["account"]["acct"] + addtext + " " + mode["base"] + ":" + mode["type"] + " " + lang["en"].lang[5], { in_reply_to_id: json['id'] }, config.post_privacy, false, 'data/tmp/effect_result' + json["id"] + imagetype);
        } else if (mode["base"] === "effect") {
            var options = {
                image: 'data/tmp/effect_user' + json["id"] + imagetype,
                to: 'data/tmp/effect_result' + json["id"] + imagetype,
                level: 5
            };

            var callback = function (error) {
                if (!error) {
                    console.log("The effect was applied to your image !");
                    post_upimg("@" + json["account"]["acct"] + addtext + " " + mode["base"] + ":" + mode["type"] + " " + lang["en"].lang[5], { in_reply_to_id: json['id'] }, config.post_privacy, false, 'data/tmp/effect_result' + json["id"] + imagetype);
                }
            }
            //https://www.npmjs.com/package/effect
            if (mode["type"] === "blur") effect.blur(options, callback);
            if (mode["type"] === "sharpen") effect.sharpen(options, callback);
            if (mode["type"] === "unsharp") effect.unsharp(options, callback);
            if (mode["type"] === "threshold") effect.threshold(options, callback);
            if (mode["type"] === "oilpaint") effect.oilpaint(options, callback);
            if (mode["type"] === "metal") effect.metal(options, callback);
            if (mode["type"] === "edge") effect.edge(options, callback);
        } else if (mode["base"] === "funia") {
            //http://photofunia.com/
            var tt = [];
            tt[0] = "lab/burning-fire";
            tt[1] = "misc/fire";
            tt[2] = "posters/wanted";
            tt[3] = "misc/making_tattoo";
            tt[4] = "misc/top-secret";
            tt[5] = "misc/big-screen";
            tt[6] = "misc/champagne";
            tt[7] = "misc/truck-advert";
            tt[8] = "all_effects/museum_kid";
            tt[9] = "all_effects/100_dollars";
            tt[10] = "all_effects/vhs";
            tt[11] = "all_effects/sketch";
            tt[12] = "all_effects/burning_photo";
            tt[13] = "all_effects/sparklers";
            tt[14] = "all_effects/portrait-gallery";
            tt[15] = "all_effects/famous-gallery";
            tt[16] = "all_effects/business-newspaper";
            tt[17] = "all_effects/tokyo-crossing";
            tt[18] = "all_effects/roller-shutters";
            tt[19] = "all_effects/lightning";

            request.post({
                url: "http://photofunia.com/categories/" + tt[mode["type"]],
                formData: {
                    'image': fs.createReadStream('data/tmp/effect_user' + json["id"] + imagetype)
                },
                followAllRedirects: true
            },
                function (error, response, data) {
                    if (!error && response.statusCode === 200) {
                        const dom = new JSDOM(data)
                        var urld = dom.window.document.getElementById('result-image').src;
                        request({
                            method: 'GET',
                            url: urld,
                            encoding: null
                        },
                            function (error, response, blob) {
                                if (!error && response.statusCode === 200) {
                                    filet = urld.match(/\.(jpg|png|gif)/i)[0];
                                    fs.writeFileSync('data/tmp/effect_result' + json["id"] + filet, blob, 'binary');
                                    post_upimg("@" + json["account"]["acct"] + addtext + " " + mode["base"] + ":" + mode["type"] + " " + lang["en"].lang[5], { in_reply_to_id: json['id'] }, config.post_privacy, false, 'data/tmp/effect_result' + json["id"] + filet);
                                }
                            }
                        );
                    }
                }
            );
        }
    })
}


function rt(id) {
    fetch("https://" + config.domain + "/api/v1/statuses/" + id + "/reblog", {
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + config.token },
        method: 'POST'
    }).then(function (response) {
        if (response.ok) {
            return response.json();
        } else {
            console.warn("NG:RT:SERVER");
            return null;
        }
    }).then(function (json) {
        if (json) {
            if (json["id"]) {
                console.log("OK:RT");
            } else {
                console.warn("NG:RT:" + json);
            }
        }
    });
}

function post_upimg(value, option = {}, visibility = config.post_privacy, force, imageurl) {
    request.post({
        url: "https://" + config.domain + "/api/v1/media",
        headers: {
            'Authorization': 'Bearer ' + config.token
        },
        formData: {
            'file': fs.createReadStream(imageurl)
        }
    }, function (error, response, json) {
        if (!error && response.statusCode == 200) {
            json = JSON.parse(json);
            if (json["id"] && json["type"] !== "unknown") {
                console.log("OK:POST_IMG", json);
                option["media_ids"] = [json["id"]];
                post(value, option, visibility, force);
            } else {
                console.warn("NG:POST_IMG:", json);
            }
        } else {
            console.warn("NG:POST_IMG:SERVER:", error);
        };
    });
}

function post(value, option = {}, visibility = config.post_privacy, force) {
    var optiondata = {
        status: value,
        visibility: visibility
    };

    if (option.cw) {
        optiondata.spoiler_text = option.cw;
    }
    if (option.in_reply_to_id) {
        optiondata.in_reply_to_id = option.in_reply_to_id;
    }
    if (option.media_ids) {
        optiondata.media_ids = option.media_ids;
    }
    fetch("https://" + config.domain + "/api/v1/statuses", {
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + config.token },
        method: 'POST',
        body: JSON.stringify(optiondata)
    }).then(function (response) {
        if (response.ok) {
            return response.json();
        } else {
            console.warn("NG:POST:SERVER");
            return null;
        }
    }).then(function (json) {
        if (json) {
            if (json["id"]) {
                console.log("OK:POST");
            } else {
                console.warn("NG:POST:" + json);
            }
        }
    });
}

function follow(id) {
    fetch("https://" + config.domain + "/api/v1/accounts/" + id + "/follow", {
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + config.token },
        method: 'POST'
    }).then(function (response) {
        if (response.ok) {
            return response.json();
        } else {
            console.warn("NG:FOLLOW:SERVER");
            return null;
        }
    }).then(function (json) {
        if (json) {
            if (json["id"]) {
                console.log("OK:FOLLOW");
            } else {
                console.warn("NG:FOLLOW:" + json);
            }
        }
    });
}
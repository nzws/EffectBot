let is_running = 1;
let eti = 0, admin_i = 0, admin_pm = false, is_talking = false, i = 0;
let config = require('./config');
let talk_data_base = [];
talk_data_base[0] = require('./data/talk/dislike');
talk_data_base[1] = require('./data/talk/base');
talk_data_base[2] = require('./data/talk/like');
let fetch = require('node-fetch');
let mysql = require('mysql');

// 埋め埋め
const { createCanvas, loadImage } = require('canvas');
const request = require('request');
const fs = require('fs');

let lang = {};
lang["ja"] = require('./data/talk_sys/ja');
lang["en"] = require('./data/talk_sys/en');

var effect = require('effect');
var { JSDOM } = require('jsdom');

let userdata = {};
let favtype = 1;
let was_check = {};

let lastup = new Date();
let lastup_day = lastup.getDate();
let day_total_fav = {};


if (!config.db_host || !config.db_user || !config.db_pass || !config.db_name || !config.db_port ||
    !config.domain || !config.token ||
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

let db = mysql.createPool({
    host: config.db_host,
    port: config.db_port,
    user: config.db_user,
    password: config.db_pass,
    database: config.db_name
});

db.getConnection(function (err, connection) {
    connection.query('SELECT * FROM `userdata`', function (error, results, fields) {
        if (error) {
            console.log("DBERROR: " + error);
            db.end();
            process.exit();
        } else {
            i = 0;
            while (results[i]) {
                userdata[results[i]["name"]] = JSON.parse(results[i]["data"]);
                i++;
            }
            Start();
        }
    });
});

function Start() {
    let mi = 0, m = ["user", "public:local"];
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
                    if (ord.event === "update") {
                        if (json['visibility'] !== 'public' && json['visibility'] !== config.post_privacy && json['visibility'] !== 'unlisted') return;
                        if (json['reblog']) return;

                        if (was_check[json['id']]) return; //HTLとLTLの重複防止
                        was_check[json['id']] = true;

                        let acct = json['account']['acct'];
                        let text = json['content'];
                        if (acct !== config.bot_id) {
                            if (is_running) {
                                if (!userdata["fav"][acct]) userdata["fav"][acct] = 50;

                                if (text.match(/(クソ|ガイジ|死|殺|21|うざ|ウザ|デブ)/i)) {
                                    userdata["fav"][acct] -= 2;
                                    console.log("@" + acct + ":minus_fav");
                                } else if (text.match(/(好き|可愛い|かわいい|すき|偉い|えらい|なるほ|ありがと|有難う|やった)/i)) {
                                    let d = new Date().getDate();
                                    if (lastup_day !== d) {
                                        lastup_day = d;
                                        lastup = new Date();
                                        day_total_fav = {};
                                        save();
                                    }
                                    if (!day_total_fav[acct]) day_total_fav[acct] = 0;
                                    if (day_total_fav[acct] <= 20) {
                                        userdata["fav"][acct]++;
                                        day_total_fav[acct]++;
                                        console.log("@" + acct + ":plus_fav");
                                    }
                                }

                                if (userdata["fav"][acct] < 20) favtype = 0; //20点未満
                                else if (userdata["fav"][acct] < 100) favtype = 1; //100点未満
                                else if (userdata["fav"][acct] < 200) favtype = 2; //200点未満
                                //else if (userdata["fav"][acct] >= 200) favtype = 3;

                                //終了
                                if (text.match(/!stop/i)) {
                                    admin_i = 0;
                                    admin_pm = false;

                                    while (config.bot_admin[admin_i]) {
                                        if (acct === config.bot_admin[admin_i]) admin_pm = true;
                                        admin_i++;
                                    }

                                    if (admin_pm) {
                                        if (acct !== config.bot_admin[0]) {
                                            post("@" + acct + " @" + config.bot_admin[0] + " 終了しました。", {}, "direct");
                                        }
                                        post("そろおち～", {}, config.post_privacy, true);
                                        change_running(0);
                                        console.log("OK:STOP:@" + acct);
                                        save();
                                    }
                                }

                                //こおりたそと一緒にエタフォ
                                if (text.match(/エターナルフォースブリザード/i) && userdata["fav"][acct] > 20) {
                                    post("@" + acct + " 私も.....！！！", { in_reply_to_id: json['id'] });
                                    eti = 0;
                                    etfav(json['id']);
                                    console.log("OK:エタフォ:" + acct);
                                }

                                //メイン部分
                                if (text.match(/(!a|あかり|!akari)/i)) {
                                    is_talking = false;
                                    rt(json['id']);

                                    if (text.match(/(リンク|短縮)/i) && config.urlshort_api) {
                                        URL(json);
                                        is_talking = true;
                                    }

                                    if (text.match(/(保存|セーブ)/i)) {
                                        admin_i = 0;
                                        admin_pm = false;

                                        while (config.bot_admin[admin_i]) {
                                            if (acct === config.bot_admin[admin_i]) admin_pm = true;
                                            admin_i++;
                                        }

                                        if (admin_pm) {
                                            save();
                                        }
                                        is_talking = true;
                                    }

                                    if (text.match(/(リロード|再起動)/i)) {
                                        admin_i = 0;
                                        admin_pm = false;

                                        while (config.bot_admin[admin_i]) {
                                            if (acct === config.bot_admin[admin_i]) admin_pm = true;
                                            admin_i++;
                                        }

                                        if (admin_pm) {
                                            save();
                                        }
                                        is_talking = true;
                                    }

                                    if (text.match(/(ルーレット)/i)) {
                                        if (json['mentions'][1]) {
                                            let r_users = json['mentions'];
                                            let num_of_people = text.match(/(\d+)人/i);
                                            let result_users = "";
                                            let i = 0, random = 0;
                                            num_of_people = num_of_people ? num_of_people[1] ? num_of_people[1] : 1 : 1;
                                            if (parseInt(num_of_people) < json['mentions'].length) {
                                                while (i < num_of_people) {
                                                    random = Math.floor(Math.random() * r_users.length);
                                                    result_users += " @" + r_users[random]["acct"];
                                                    r_users.splice(random, 1);
                                                    i++;
                                                }
                                                post("@" + acct + " ルーレットしたよー！\n\n結果:" + result_users);
                                            } else {
                                                post("@" + acct + " 人数指定ルーレットは指定した人数+1人を入力してね！", { in_reply_to_id: json['id'] }, "direct");
                                            }
                                        } else {
                                            post("@" + acct + " ルーレットをする時はルーレットしたいアカウントを2つ以上入力してね！", { in_reply_to_id: json['id'] }, "direct");
                                        }
                                        is_talking = true;
                                    }

                                    //埋める
                                    if (text.match(/埋め(たい|ろ|て)/i)) {
                                        if (json['mentions'][1]) {
                                            post("@" + acct + " 一度に埋められる人は1人までだよ！", { in_reply_to_id: json['id'] }, "direct");
                                        } else if (json['mentions'][0]) {
                                            if (json['mentions'][0]["acct"] === config.bot_id || json['mentions'][0]["acct"] === acct) {
                                                let deny_who = json['mentions'][0]["acct"] === config.bot_id ? "私" : "あなた";
                                                post("@" + acct + " " + deny_who + "は埋められないよぉ！？", { in_reply_to_id: json['id'] }, "direct");
                                            } else {
                                                umeru(json['mentions'][0], acct);
                                            }
                                        } else {
                                            post("@" + acct + " 埋めたい人のIDを記入してね！", { in_reply_to_id: json['id'] }, "direct");
                                        }
                                        is_talking = true;
                                    }

                                    //たこ焼き (ちょくだいさんに無能扱いされたので)
                                    if (text.match(/たこ(焼き|やき)/i) && text.match(/((焼|や)いて|(作|つく)って|(食|た)べたい|ちょ(ー|～|う|く)だい|(欲|ほ)しい|お(願|ねが)い)/i)) {
                                        setTimeout(function () {
                                            if (userdata["fav"][acct] > 20) {
                                                post("@" + acct + " たこ焼きど～ぞ！\n\n" +
                                                    ":takoyaki:");
                                            } else {
                                                post("@" + acct + " えぇ...あなたにはちょっと...", { in_reply_to_id: json['id'] });
                                            }
                                        }, 5000);
                                        console.log("OK:takoyaki:" + acct);
                                        is_talking = true;
                                    }

                                    if (text.match(/(画像|エフェクト|effect|)/i)) {
                                        var imagetype = ".png";
                                        if (json['mentions'][0]) {
                                            if (json['mentions'][1]) {
                                                post("@" + acct + " " + lang[json["language"] === "en" ? "en" : "ja"].lang[0], { in_reply_to_id: json['id'] }, "direct");
                                            } else {
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
                                                                        fs.writeFileSync('data/tmp/effect_user' + imagetype, blob, 'binary');
                                                                        image_effect(imagetype, json, (" @" + jsoni["acct"] + " で "));
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
                                                post("@" + acct + " " + lang[json["language"] === "en" ? "en" : "ja"].lang[1], { in_reply_to_id: json['id'] }, "direct");
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
                                                                fs.writeFileSync('data/tmp/effect_user' + imagetype, blob, 'binary');
                                                                image_effect(imagetype, json);
                                                            } else {
                                                                console.warn("NG:IMAGEGET_EFFECT");
                                                            }
                                                        }
                                                    );
                                                } else {
                                                    post("@" + acct + " " + lang[json["language"] === "en" ? "en" : "ja"].lang[2], { in_reply_to_id: json['id'] }, "direct");
                                                }
                                            }
                                        } else {
                                            post("@" + acct + " " + lang[json["language"] === "en" ? "en" : "ja"].lang[3], { in_reply_to_id: json['id'] }, "direct");
                                        }
                                        is_talking = true;
                                    }

                                    if (!is_talking) {
                                        i = 0;

                                        while (talk_data_base[favtype].talkdata_base[i]) {
                                            if (text.match(new RegExp(talk_data_base[favtype].talkdata_base[i][0], 'i'))) {
                                                post("@" + acct + " " + talk_data_base[favtype].talkdata_base[i][1], { in_reply_to_id: json['id'] });
                                            }
                                            i++;
                                        }
                                    }
                                }
                            } else {
                                if (acct === config.bot_admin[0]) {
                                    if (text.match(/!start/i) || text.match(/あかり(ちゃん|たそ)(起動|おきて|起きて)/i)) {
                                        change_running(1);
                                        post("おはおは～");
                                    }
                                }
                            }
                        }
                    } else if (ord.event === "notification") {
                        if (json["type"] === "follow" && json["account"]["id"]) {
                            follow(json["account"]["id"]);
                        }
                    }
                }
            } catch (e) {
                post("@" + config.bot_admin[0] + " 【エラー検知】\n\n" + e, {}, "direct", true);
                save();
                post("ごほっ、ごほっ...\n" +
                    "ちょっと体調悪いから休む...");
                change_running(0);
            }
        });
    });

    client.connect("wss://" + config.domain + "/api/v1/streaming/?access_token=" + config.token + "&stream=" + mode);
}


// ここからいろいろ
function save(end) {
    db.getConnection(function (err, connection) {
        connection.query('UPDATE `userdata` SET `data` = ? WHERE `userdata`.`name` = \'fav\'', [JSON.stringify(userdata["fav"])], function (err, result) {
            console.log("OK:SAVE");
            connection.release();
            if (end) db.end();
        });
    });
}

function image_effect(imagetype, json, addtext = "") {
    console.log(addtext);
    loadImage('data/tmp/effect_user' + imagetype).then((image) => {
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
            post("@" + acct + " " + lang[json["language"] === "en" ? "en" : "ja"].lang[4], { in_reply_to_id: json['id'] }, "direct");
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
            fs.writeFileSync('data/tmp/effect_result' + imagetype, blobdata, 'binary');
            post_upimg("@" + json["account"]["acct"] + addtext + " " + mode["base"] + ":" + mode["type"] + " " + lang[json["language"] === "en" ? "en" : "ja"].lang[5], {}, config.post_privacy, false, 'data/tmp/effect_result' + imagetype);
        } else if (mode["base"] === "effect") {
            var options = {
                image: 'data/tmp/effect_user' + imagetype,
                to: 'data/tmp/effect_result' + imagetype,
                level: 5
            };

            var callback = function (error) {
                if (!error) {
                    console.log("The effect was applied to your image !");
                    post_upimg("@" + json["account"]["acct"] + addtext + " " + mode["base"] + ":" + mode["type"] + " " + lang[json["language"] === "en" ? "en" : "ja"].lang[5], {}, config.post_privacy, false, 'data/tmp/effect_result' + imagetype);
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
                    'image': fs.createReadStream('data/tmp/effect_user' + imagetype)
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
                                    fs.writeFileSync('data/tmp/effect_result' + filet, blob, 'binary');
                                    post_upimg("@" + json["account"]["acct"] + addtext + " " + mode["base"] + ":" + mode["type"] + " " + lang[json["language"] === "en" ? "en" : "ja"].lang[5], {}, config.post_privacy, false, 'data/tmp/effect_result' + filet);
                                }
                            }
                        );
                    }
                }
            );
        }
    })
}

function umeru(user, acct) {
    const is_honki = !!(userdata["fav"][acct] > 99);
    let rand = Math.floor(Math.random() * is_honki ? 500 : 30) + 1;
    let talktext, dead_mode = "";
    if (rand < 5) {
        honki_text = " ";
        talktext = "" + rand + "メートルぐらいしか埋められなかった...";
        dead_mode = "dirt_and_stone";
    } else {
        honki_text = is_honki ? "本気で" : " ";
        talktext = "" + (rand * 5) + "メートルぐらい埋められたよ！";
        let rand_dead = Math.floor(Math.random() * 21);
        dead_mode = "stone";
        if (rand_dead > 15) {
            dead_mode = "lava";
            talktext += "(マグマに落ちちゃった...)";
        } else if (rand_dead > 10) {
            dead_mode = "water";
            talktext += "(溺れちゃった...)";
        } else if (rand > 28) { //岩盤
            dead_mode = "bedrock";
        }
    }

    const canvas = createCanvas(380, 380)
    const ctx = canvas.getContext('2d')
    fetch("https://" + config.domain + "/api/v1/accounts/" + user["id"], {
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + config.token },
        method: 'GET'
    }).then(function (response) {
        if (response.ok) {
            return response.json();
        } else {
            console.warn("NG:USERGET:SERVER");
            return null;
        }
    }).then(function (json) {
        if (json) {
            if (json["id"]) {
                request({
                    method: 'GET',
                    url: json["avatar_static"],
                    encoding: null
                },
                    function (error, response, blob) {
                        if (!error && response.statusCode === 200) {
                            console.log("OK:IMAGEGET:" + acct);
                            fs.writeFileSync('data/tmp/umeume_user.png', blob, 'binary');

                            loadImage('data/images/' + dead_mode + '.png').then((image) => {
                                ctx.drawImage(image, 0, 0)

                                loadImage('data/tmp/umeume_user.png').then((image2) => {
                                    ctx.drawImage(image2, 145, 145, 90, 90)

                                    var blobdata = new Buffer((canvas.toDataURL()).split(",")[1], 'base64');
                                    fs.writeFileSync('data/tmp/umeume_result.png', blobdata, 'binary');
                                    post_upimg("@" + acct + " と一緒に" + honki_text + " " + json["display_name"] + " を埋めたら" + talktext, {}, config.post_privacy, false, 'data/tmp/umeume_result.png');
                                    console.log("OK:埋める:" + acct);
                                })
                            })
                        } else {
                            console.warn("NG:IMAGEGET");
                        }
                    }
                );
            } else {
                console.warn("NG:USERGET:" + json);
            }
        }
    });
}

function URL(json) {
    post("@" + json['account']['acct'] + " 送信してるから数十秒まっててねー！", { in_reply_to_id: json['id'] });
    setTimeout(function () {
        fetch("https://" + config.domain + "/api/v1/statuses/" + json['id'] + "/card", {
            method: 'GET'
        }).then(function (response) {
            if (response.ok) {
                return response.json();
            } else {
                console.warn("NG:url_card:SERVER");
                return null;
            }
        }).then(function (json_url) {
            if (json_url) {
                if (json_url["url"]) {
                    fetch("https://" + config.urlshort_api + "?akari_id=Akari_" + json['account']['acct'] + "&url=" + encodeURIComponent(json_url["url"]), {
                        method: 'GET'
                    }).then(function (response) {
                        if (response.ok) {
                            return response.text();
                        } else {
                            post("@" + json['account']['acct'] + " @" + config.bot_admin[0] + " APIにアクセスできなかった...", { in_reply_to_id: json['id'] }, "direct");
                            console.warn("NG:url:SERVER");
                            return null;
                        }
                    }).then(function (text) {
                        if (text.match(/http/i)) {
                            post("@" + json['account']['acct'] + " はいど～ぞ！\n" + text, { in_reply_to_id: json['id'] });
                        } else {
                            post("@" + json['account']['acct'] + " @" + config.bot_admin[0] + " 何か失敗したみたい... エラー:" + text, { in_reply_to_id: json['id'] }, "direct");
                            console.warn("NG:url:" + json);
                        }
                    });
                } else {
                    post("@" + json['account']['acct'] + " ...？\nURLが取得できなかった...", { in_reply_to_id: json['id'] });
                }
            }
        });
    }, 20000);
}

function etfav(id) {
    fetch("https://" + config.domain + "/api/v1/statuses/" + id + "/favourite", {
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + config.token },
        method: 'POST'
    }).then(function (response) {
        if (response.ok) {
            return response.json();
        } else {
            console.warn("NG:fav:SERVER");
            return null;
        }
    }).then(function (json) {
        if (json) {
            if (json["id"]) {
                console.log("OK:fav");
                fetch("https://" + config.domain + "/api/v1/statuses/" + id + "/unfavourite", {
                    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + config.token },
                    method: 'POST'
                }).then(function (response) {
                    if (response.ok) {
                        return response.json();
                    } else {
                        console.warn("NG:fav:SERVER");
                        return null;
                    }
                }).then(function (json) {
                    if (json) {
                        if (json["id"]) {
                            console.log("OK:fav");
                            if (eti < 20) {
                                etfav(id);
                                eti++;
                            }
                        } else {
                            console.warn("NG:fav:" + json);
                        }
                    }
                });
            } else {
                console.warn("NG:fav:" + json);
            }
        }
    });
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
    if (is_running || force) {
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
    if (is_running || force) {
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

function change_running(mode) {
    if (mode === 1) {
        is_running = 1;
        console.log("OK:START");
    } else {
        is_running = 0;
        console.log("OK:STOP");
    }
}
// ==UserScript==
// @name         M-Team to qBittorrent Web UI 下载工具
// @namespace    M-Team to qBittorrent Web UI 下载工具
// @description  在馒头详情页添加一个下载按钮，点击按钮可以选择【标题|种子名|副标题】添加种子到 qBittorrent Web UI，同时进行文件重命名。
// @version      2.9
// @icon         https://kp.m-team.cc/favicon.ico
// @match        https://kp.m-team.cc/details.php*
// @match        https://kp.m-team.cc/*/details.php*
// @require      https://cdn.jsdelivr.net/npm/vue@2.7.14/dist/vue.js
// @grant        GM_xmlhttpRequest
// @grant        GM_log
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @connect *
// @author       passerby
// ==/UserScript==

(function () {
    'use strict';
    // let config = {
    //     address: GM_getValue("address"), // qBittorrent Web UI 地址 http://127.0.0.1:8080
    //     username: GM_getValue("username"), // qBittorrent Web UI的用户名
    //     password: GM_getValue("password"), // qBittorrent Web UI的密码
    //     savePath: GM_getValue("savePath"), // 下载目录 默认
    //     saveLocations: GM_getValue("locations"), // 下载目录 默认
    //     separator: (GM_getValue("savePath") && GM_getValue("savePath")[1] == ":") ? "\\" : "/", // 文件分隔符 兼容 Linux Windows
    //     paused: () => {
    //         console.log("调用函数")
    //         let falg = (!GM_getValue("paused") || GM_getValue("paused") == false) ? false : true
    //         console.log("设置值为:", falg)
    //         return falg
    //     },  // 暂停 ? false 自动开始 : true 暂停
    // };

    let config = {}

    // 种子以这些文件结尾时,单文件储存,非目录
    const fileSuffix = [
        ".zip",
        ".rar",
        ".7z",
        ".tar.gz",
        ".tgz",
        ".tar.bz2",
        ".tbz2",
        ".tar",
        ".gz",
        ".bz2",
        ".xz",
        ".lzma",
        ".md",
        ".txt",
        ".pdf",
        ".epub",
        ".mp4",
        ".avi",
        ".mkv",
        ".mov",
        ".wmv",
        ".flv",
        ".mpg",
        ".mpeg",
        ".3gp",
        ".webm",
        ".rmvb",
        ".mp3",
        ".wav",
        ".flac",
        ".aac",
        ".ogg",
        ".wma",
        ".m4a",
        ".mpc",
        ".iso"
    ]

    /**
     * 判断 torrentName 是否是以数组fileSuffix中的字符串结尾的,是的话返回false
     *
     * @param {String} torrentName
     *
     * @returns {Boolean}
     */
    function isFolder(torrentName) {
        for (const suffix of fileSuffix) {
            if (torrentName.endsWith(suffix)) {
                return false;
            }
        }
        return true;
    }

    function getSuffix(torrentName) {
        for (const suffix of fileSuffix) {
            if (torrentName.endsWith(suffix)) {
                return suffix;
            }
        }
        return "";
    }

    /**
     * @description: 加入失败后使用失败重试功能，如果5次中有任意一次成功了，就停止尝试并返回
     * @param  {*}
     * @return {*}
     * @param {*} fn 绑定函数
     * @param {*} times 请求次数
     * @param {*} delay 延迟时间
     */
    Promise.retry = function (fn, times, delay) {
        let tryTimes = 0
        return new Promise((resolve, reject) => {
            function attempt() {
                console.log(tryTimes)
                Promise.resolve(fn()).then(res => {
                    return resolve(res)
                }).catch(err => {
                    if (++tryTimes < times) {
                        setTimeout(attempt, delay)
                    } else {
                        return reject(err)
                    }
                })
            }
            attempt()
        })
    }

    /**
     *
     * @param {*} torrentName 选择的名字
     */
    let getTorrentInfo = (torrentName) => {

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${config.address}/api/v2/sync/maindata`,
                onload: function (response) {

                    let data = JSON.parse(response.responseText).torrents;

                    const hashes = Object.keys(data);

                    console.log("种子列表长度:", hashes)

                    for (let hash of hashes) {

                        let info = data[hash];
                        if (info.name == torrentName) {

                            console.log('TorrentInfo:', info);


                            // content_path 这个路径不同版本不固定,有时候是相对路径,有时候是绝对路径

                            // let oldFileName = info.content_path.replace(info.save_path, '').match(/([^\/]+)/)[0];

                            // 下载目录下面第一级
                            let oldFilePath = info.content_path.replace(info.save_path, '');

                            if (!oldFilePath.startsWith(config.separator)) oldFilePath = config.separator + oldFilePath;

                            let oldFileName = oldFilePath.split(config.separator)[1];

                            console.log(`OldFileName: ${oldFileName}`);

                            console.log(`NewFileName: ${torrentName}`);

                            return resolve({
                                "hash": hash,
                                "oldFileName": oldFileName,
                                "torrentName": torrentName,
                                "message": "获取种子信息成功."
                            })
                        }

                    }
                    console.log(data)
                    reject("获取种子信息失败,种子列表未找到种子.")
                },
                onerror: function (error) {
                    console.error('获取种子信息失败: 请求发生错误:', error);
                    reject("获取种子信息失败!")
                }
            });
        })

    }


    /**
     * 重命名
     *
     * hash: hash
     * oldPath: 111
     * newPath: 222
     *
     * @param {*} hash
     * @param {*} oldPath
     * @param {*} newPath
     */
    function renameFileOrFolder(hash, oldPath, newPath) {
        return new Promise((resolve, reject) => {


            const isFolderFlag = isFolder(oldPath);
            const endpoint = isFolderFlag ? '/api/v2/torrents/renameFolder' : '/api/v2/torrents/renameFile';


            GM_xmlhttpRequest({
                method: 'POST',
                url: `${config.address}${endpoint}`,
                data: getQueryString({
                    'hash': hash,
                    'oldPath': oldPath,
                    'newPath': newPath
                }),
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
                },
                onload: function (response) {
                    console.log('重命名成功.');
                    resolve("重命名成功.")
                },
                onerror: function (error) {
                    // 请求失败
                    console.error('重命名请求失败: ', error);
                    reject('重命名失败!');
                }
            });
        })
    }

    function getQueryString(params) {
        return Object.keys(params)
            .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
            .join('&');
    }


    let login = () => {
        return new Promise((resolve, reject) => {
            if (!config.username || !config.password) {
                return reject("请点击脚本设置 QBittorrent 下载配置！")
            }
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${config.address}/api/v2/auth/login`,
                data: getQueryString({
                    'username': config.username,
                    'password': config.password
                }),
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
                },
                onload: function (response) { // 请求成功
                    console.log('Login Response:', response.responseText);
                    resolve("登录成功！")
                },
                onerror: function (error) { // 请求失败
                    console.error('请求发生错误:', error);
                    reject("登录失败！");
                }
            });
        })
    }



    /**
     * 将种子添加到qBittorrent
     * @param {String} rename 选中种子名
     */
    function addTorrentToQBittorrent(rename, savePath) {
        return new Promise((resolve, reject) => {

            let torrentUrl = 'https://kp.m-team.cc' + document.evaluate("//a[text()='[IPv4+https]']", document).iterateNext().getAttribute("href");

            // 构建请求体数据
            let formData = new FormData();
            formData.append('urls', torrentUrl);
            formData.append('autoTMM', false); // 手动
            formData.append('savepath', savePath);
            formData.append('cookie', '');
            formData.append('rename', rename);
            formData.append('category', '');
            formData.append('paused', !config.autoStartDownload); // 暂停? 默认 false
            formData.append('stopCondition', 'None');
            formData.append('contentLayout', 'Original');
            formData.append('dlLimit', 'NaN');
            formData.append('upLimit', 'NaN');

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${config.address}/api/v2/torrents/add`,
                data: formData,
                onload: function (response) {
                    const responseData = response.responseText;
                    if (responseData !== "Ok.") {
                        return reject(`添加种子失败: ${responseData}`);
                    } else {
                        return resolve("添加种子成功.");
                    }
                },
                onerror: function (error) {
                    console.error('添加种子失败: 请求发生错误:', error);
                    return reject("添加种子失败: 请求发生错误...");
                }
            });

        })
    }

    let sleep = (time) => {
        return new Promise((resolve) => {
            setTimeout(function () {
                console.log(`经过 ${time} 毫秒`);
                resolve()
            }, time);
        })
    }



    function download(rename, savePath) {
        login().then(m => { // 添加种子
            console.log(m)
            return addTorrentToQBittorrent(rename, savePath);
        }).then(m => { // 延迟
            console.log(m)
            return sleep(1000);
        }).then(m => {
            return Promise.retry(() => getTorrentInfo(rename), 20, 1500);
        }).then((data) => { // 文件重命名
            console.log(data.message);
            return renameFileOrFolder(data.hash, data.oldFileName, data.torrentName);
        }).then(() => alert("下载并重命名成功!")).catch((e) => {
            console.log(e);
            alert(e);
        })
    };


    /**
     *
     * 取代 Linux 和 Windows 非法字符为空格
     *
     * @param {*} filename
     */
    function replaceUnsupportedCharacters(filename) {
        // 使用正则表达式匹配Linux和Windows不支持的字符
        let unsupportedCharsRegex = /[\/:*?"<>|]/g;

        // 将不支持的字符替换为空格
        let replacedFilename = filename.replace(unsupportedCharsRegex, ' ');

        return replacedFilename;
    }

    /**
     * 获取种子名
     */
    let getTorrentName = function () {
        let str = document.querySelector("#outer > table:nth-child(2) > tbody > tr:nth-child(1) > td.rowfollow > a.index").innerText;
        console.log(str)
        let regex = /\.(.+)\./;
        let match = regex.exec(str);
        let dynamicPart = match[1];
        return dynamicPart;
    }


    let subTitle = replaceUnsupportedCharacters(document.querySelector("#outer > table:nth-child(2) > tbody > tr:nth-child(2) > td.rowfollow").innerText.trim());
    let title = replaceUnsupportedCharacters(document.querySelector("#top").innerText).trim().replace(/\[([^\[\]]+)\]$/g, '').trim();
    let torrentName = getTorrentName();

    let popupCode = `

        <button id="qbDownload">QBitorrent下载</button>

        
        `;

    GM_addStyle(`
            .popup {
                width: auto;
                min-width: 550px;
                height: auto;
                min-height: 50px;
                background-color: #7c98ae;
                border: 3px solid #587993;
                border-radius: 4px;
                padding: 10px;
                position: absolute;
                top: 50%;
                left: 50%;
                /* 在水平和垂直方向上都将元素向左和向上平移了它自身宽度和高度的一半。 */
                transform: translate(-50%, -50%);
            }

            .popup button {
                margin: 5px;
            }

            .textinput {
                width: 400px;
                background-color: #e4e4e4;
                border: 1px solid #587993;
                border-radius: 4px;
                height: 1.5em;
                display: inline-block;
                position: absolute;
                top: 50%;
                left: 0;
                transform: translate(0, -50%);
                width: 100%;
                font-size: 12px;
                line-height: 12px;
                margin: 0 8px 0 8px;
                width: calc(100% - 20px);
            }

            .popup input:focus {
                /* 这条语句必须有，不然border效果不生效 */
                outline: none;
                border: 1px solid #587993;
            }

            .popup table {
                width: 100%;
            }

            .popup tbody th {
                width: 5em;
            }

            .popup .t-download {
                width: 5em;
            }

            .popup td,
            .popup th {
                vertical-align: middle;
            }

            .popup .t-text {
                position: relative;
            }

            .popup .t-text p {
                visibility: hidden;
                margin: 0.8em;
                font-size: 12px;
                line-height: 1em;
            }

            .location-btn {
                height: 18px;
                font-size: 12px;
                line-height: 12px;
                margin: 0 !important;
            }

            .draggable {
                position: absolute;
                // cursor: grab;
            }

        `);

    GM_addStyle(`
        #configPopup input {
            position: initial;
            transform: none;
            padding: 0;
            margin: 0;
            width: 100%;
            border: 0;
            border-radius: 0;
        }

    `)

    // 获取指定元素
    let targetElement = document.querySelector("#outer > table:nth-child(2) > tbody > tr:nth-child(5) > td.rowfollow");
    targetElement.innerHTML += popupCode;

    const menu_command_id = GM_registerMenuCommand("点击这里进行配置", function () {
        configDivApp.isVisible = true
    });

    let configPopupHtml = `
        <div id="configPopup"  class="popup" v-show="isVisible">
            <form id="configForm">
            <table>
                <thead style="height: 3em;">
                    <tr>
                        <th colspan="3">请进行 qBittorrent 配置 </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th>地址:</th>
                        <td class="t-text">
                            <input class="textinput" type="text" placeholder="http://127.0.0.1:8080" v-model="config.address">
                        </td>
                    </tr>
                    <tr>
                        <th>用户名:</th>
                        <td class="t-text">
                            <input class="textinput" type="text" placeholder="qBittorrent 用户名" v-model="config.username">
                        </td>
                    </tr>
                    <tr>
                        <th>密码:</th>
                        <td class="t-text">
                            <input class="textinput" type="password" placeholder="qBittorrent 密码" v-model="config.password">
                        </td>
                    </tr>
                    <!-- <tr>
                        <th>下载路径:</th>
                        <td class="t-text">
                            <input class="textinput" v-model="config.savePath" placeholder="下载路径">
                        </td>
                    </tr> -->
                    <tr>
                        <th>下载位置:</th>
                        <td class="t-text">
                            <table>
                                <tbody>
                                    <tr v-for="(item, index) in config.saveLocations" :key="index">
                                        <td><input class="textinput" v-model="item.label" placeholder="标签"></td>
                                        <td>
                                            <input class="textinput" v-model="item.value" placeholder="下载路径">
                                        </td>
                                        <td ><button class="location-btn" type="button" @click="delLine(index)">删除</button></td>
                                    </tr>
                                    <tr>
                                        <th></th>
                                        <td style="border: 0;"></td>
                                        <td style="border: 0;"><button class="location-btn" type="button" @click="addLine()" style="background-color: azure;">添加</button></td>
                                        <!-- <button type="button" @click="saveLine($event)">保存</button> -->
                                    </tr>
                                </tbody>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <th>自动开始:</th>
                        <td class="t-text">
                            <input class="textinput" type="checkbox" :checked="config.autoStartDownload" v-model="config.autoStartDownload" @change="autoStartDownloadCheckboxChange">
                        </td>
                    </tr>
                    <tr>
                        <th></th>
                        <td class="t-text"><button type="button" id="configSave" @click="configSave($event)">保存</button><button  type="button" @click="toggleConfigPopup()" style="background-color: azure;">关闭</button></td>
                    </tr>
                </tbody>
            </table>
            </form>
        </div>

        <div id="popup" class="popup draggable"  @mousedown="startDragging" v-show="isPopupVisible" :style="calculateStyles">

            <table>
                <thead style="height: 3em;">
                    <tr>
                        <th id="download-title" colspan="3">请选择文件名下载 </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th>下载位置:</th>
                        <td class="t-text" colspan="2" style="padding: 6px 6px 6px 6px;">
                            <div style="flex-wrap: wrap;">
                                <label :title="item.value" style="vertical-align: middle;white-space: nowrap;display: inline-flex;padding: 3px;" v-for="(item, index) in config.saveLocations" :key="index">
                                    <input style="vertical-align: middle;margin: 0px 2px 0px 2px;" type="radio" v-model="selectedLabel" :value="index">
                                    {{ item.label }}
                                </label>
                            </div>
                        </td>

                    </tr>
                    <tr>
                        <th>种子名:</th>
                        <td class="t-text">
                            <input class="textinput" v-model="torrentName">
                            <p>{{torrentName}}</p>
                        </td>
                        <td class="t-download"><button @click="download(torrentName)">下载</button></td>
                    </tr>
                    <tr>
                        <th>主标题:</th>
                        <td class="t-text">
                            <input class="textinput" v-model="title">
                            <p>{{title}}</p>
                        </td>
                        <td class="t-download"><button @click="download(title)">下载</button></td>
                    </tr>
                    <tr>
                        <th>副标题:</th>
                        <td class="t-text">
                            <input class="textinput" v-model="subTitle">
                            <p>{{subTitle}}</p>
                        </td>
                        <td class="t-download"><button @click="download(subTitle)">下载</button></td>
                    </tr>
                    <tr>
                        <th>自动开始:</th>
                        <td class="t-text"><input class="textinput" type="checkbox" :checked="config.autoStartDownload" v-model="config.autoStartDownload"></td>
                        <td class="t-download"><button @click="togglePopup()" style="background-color: azure;">关闭</button></td>
                    </tr>
                </tbody>
            </table>
        </div>

    `;


    document.querySelector("#outer > table:nth-child(2) > tbody > tr:nth-child(7) > td.rowfollow").innerHTML += "<div id='configDiv'></div>"

    document.getElementById("configDiv").innerHTML = configPopupHtml;

    let configDivApp = new Vue({
        el: '#configDiv',
        data: {
            isVisible: false, // 
            isPopupVisible: false,
            selectedLabel: GM_getValue("selectedLabel") ? GM_getValue("selectedLabel") : 0, // 默认下载位置索引
            config: {
                address: GM_getValue("address"), // qBittorrent Web UI 地址 http://127.0.0.1:8080
                username: GM_getValue("username"), // qBittorrent Web UI的用户名
                password: GM_getValue("password"), // qBittorrent Web UI的密码
                saveLocations: GM_getValue("saveLocations") ? GM_getValue("saveLocations") : [{ label: "默认", value: GM_getValue("savePath") ? GM_getValue("savePath") : "" }], // 下载目录 默认 savePath 兼容老版本
                separator: (GM_getValue("savePath") && GM_getValue("savePath")[1] == ":") ? "\\" : "/", // 文件分隔符 兼容 Linux Windows
                autoStartDownload: GM_getValue("autoStartDownload") == null ? true : GM_getValue("autoStartDownload")
            },
            torrentName: torrentName,
            title: title,
            subTitle: subTitle,
            // 拖动div
            isDragging: false,
            initialX: 0,
            initialY: 0,
            position: { x: 0, y: 0 },
        },
        methods: {
            toggleConfigPopup() {
                // 切换元素的显示与隐藏
                this.isVisible = !this.isVisible;
            },
            togglePopup() {
                // 切换元素的显示与隐藏
                this.isPopupVisible = !this.isPopupVisible;
            },
            configSave(event) {
                console.log(this.config)
                this.toggleConfigPopup();

                Object.entries(this.config).forEach(([key, value]) => {
                    console.log(`Key: ${key}, Value: ${value}`);
                    GM_setValue(key, value);
                });
            },
            autoStartDownloadCheckboxChange() {
                console.log('Checkbox state changed. New state:', this.config.autoStartDownload);
                GM_setValue("autoStartDownload", this.config.autoStartDownload);
            },
            download(inputValue) {

                console.log("TorrentName: ", torrentName)
                console.log("InputValue: ", inputValue)

                this.togglePopup();

                const isFolderFlag = isFolder(torrentName);

                // 原来文件是单文件 当前文件名未加后缀
                if (!isFolderFlag && isFolder(inputValue)) inputValue += getSuffix(torrentName);

                console.log("InputValue 增加后缀: ", inputValue)

                let byteCount = new TextEncoder().encode(inputValue).length;
                if (byteCount > 255) {
                    console.log(`字节数超过255，有 ${byteCount} 个字节。`);
                    alert(`字节数超过255，一个中文占用3字节，当前字节数:${byteCount}`);
                    return;
                }

                config = this.config;

                let savePath = this.config.saveLocations[this.selectedLabel].value;
                console.log("下载路径:", savePath)

                // 记住上次下载位置
                GM_setValue("selectedLabel", this.selectedLabel);

                download(inputValue, savePath);
            },
            addLine() {
                this.config.saveLocations.push({ label: "", value: "" })
            },
            saveLine() {
                GM_setValue("saveLocations", this.config.saveLocations)
            },
            delLine(index) {
                console.log("删除元素:", this.config.saveLocations[index])
                this.config.saveLocations.splice(index, 1)
            },
            // 拖动 div
            startDragging(e) {

                console.log("拖动", e.target)
                if (e.target === this.$el.querySelector('#popup') || e.target === this.$el.querySelector('#download-title')) {  // 只有在鼠标在popup上时才允许拖动,外圈
                    this.isDragging = true;
                    this.initialX = e.clientX - this.position.x;
                    this.initialY = e.clientY - this.position.y;
                    // 鼠标样式设置为 grabbing 拖动
                    // this.$el.querySelector('#popup').style.cursor = 'grabbing';

                    window.addEventListener('mousemove', this.drag);
                    window.addEventListener('mouseup', this.stopDragging);
                }
            },
            drag(e) {
                if (!this.isDragging) return;
                this.position.x = e.clientX - this.initialX;
                this.position.y = e.clientY - this.initialY;
            },
            stopDragging() {
                this.isDragging = false;
                // 抓住鼠标样式
                // this.$el.querySelector('#popup').style.cursor = 'grab';

                window.removeEventListener('mousemove', this.drag);
                window.removeEventListener('mouseup', this.stopDragging);
            },
        },
        computed: {
            calculateStyles() {
                if (this.position.x == 0 && this.position.y == 0) {
                    console.log(this.$el.querySelector('#popup'))
                    const parentWidth = this.$el.querySelector('#popup').offsetWidth;
                    const parentHeight = this.$el.querySelector('#popup').offsetHeight;

                    const translateX = -50 * parentWidth / 100;
                    const translateY = -50 * parentHeight / 100;
                    console.log("translateX", translateX)
                    console.log("translateY", translateY)
                    this.position.x = translateX;
                    this.position.y = translateY;
                }
                return {
                    transform: `translate(${this.position.x}px, ${this.position.y}px)`,
                };
            },
        },
    })

    document.getElementById("qbDownload").addEventListener('click', function (event) {
        console.log(event.currentTarget)
        configDivApp.isPopupVisible = true
    })


})();

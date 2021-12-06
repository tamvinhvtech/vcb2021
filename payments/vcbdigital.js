const rootCas = require('ssl-root-cas/latest').create();
require('https').globalAgent.options.ca = rootCas;
const axios = require('axios');
const cheerio = require('cheerio');
const url = require('url');
const { v4: uuidv4 } = require('uuid');
const request = require('request');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const BPromise = require('bluebird');
const moment = require('moment-timezone');
const imageToBase64 = require('image-to-base64');
const DigitalSCryptor = require('./DigitalSCryptor');
const io = require('socket.io-client');
const { resolve, reject } = require('bluebird');
const db = require(path.normalize(__dirname + '/./database'));
const fromEntries = require('fromentries');


// Nếu need2login==true thì mới cần login, không thì pass luôn, khỏi phải làm gì.

class VCBDigital {
    constructor(extra_options = {}) {
        try {
            let { captcha_service, accountNumber, username, password, captcha_key, vcb_socket_url, lengthInPage } = extra_options;
            this.captcha_service = captcha_service || 'azcaptcha';
            this.accountNumber = accountNumber || '';
            this.Account = '';
            this.db = db;
            this.socket_connected = false;
            this.username = username || '';
            this.password = password || '';
            this.Stream = new stream.Stream();
            this.captcha_key = (typeof(captcha_key) == "object")?captcha_key || ['']:[captcha_key || ''];
            switch (captcha_service) {
                case 'azcaptcha':
                    this.solver = require('./captcha_services/solveCaptchaWithAzCaptcha');
                    this.solver.setApiKey(captcha_key[0]);
                    break;
                case 'twocaptcha':
                    this.solver = require('./captcha_services/twocaptcha');
                    this.solver.setApiKey(captcha_key[0]);
                    break;
                case 'anticaptcha':
                    this.solver = require('./captcha_services/solveCaptchaWithAnti');
                    this.solver.setApiKey(captcha_key[0]);
                    break;
                case 'deathbycaptcha':
                    this.solver = require('./captcha_services/deathbycaptcha2');
                    this.solver.setApiKey(captcha_key[0]);
                    break;
                default:
                    this.solver = require('./captcha_services/solveCaptchaWithAzCaptcha');
                    this.solver.setApiKey(captcha_key[0]);
                    break;
            }
            this.captcha_id = '';
            this.DigitalSCryptor = new DigitalSCryptor();
            this.lastinfo = '';
            this.lengthInPage = lengthInPage || 1000;
        } catch (e) {
            throw e;
        }
    }
    removeEmpty(obj) {
        return  fromEntries(
            Object.entries(obj)
            .filter(([k, v]) => v != null)
            .map(([k, v]) => (typeof v === "object" ? [k, this.removeEmpty(v)] : [k, v]))
        )
    }
    addAccount2db() {
        return new Promise((resolve, reject) => {
            let query = 'INSERT INTO banks(accountNumber, username, password) VALUES(?, ?, ?)';
            let queryData = ['', this.username, ''];
            this.db.query(query, queryData, (err, insertResults) => {
              if (err) {
                reject(err);
              } else {
                if (insertResults.affectedRows == 1) {
                  resolve();
                } else {
                  reject(new Error('Can not insert account'));
                }
              }
            });
        });
    }
    init() {
        return new Promise((resolve, reject) => {
            this.Stream.emit('log', `${this.username} | Dang khoi tao`);
            if (this.username.length == 0 || this.password.length == 0) {
                reject(new Error('Mat khau hoac ten dang nhap khong de trong'));
            } else {
                this.db.query('SELECT cookies FROM banks WHERE username = ?', [this.username], async (err, banks) => {
                    if (err) {
                        reject(err);
                    } else {
                        if (banks == undefined || (banks || []).length == 0) {
                            // reject(new Error('Can not find bank in database'));
                            try {
                                await this.addAccount2db();
                            } catch (e) {
                                reject(e);
                            }
                        } else {
                            this.lastinfo = banks[0].cookies;
                        }

                        let need2_init_new = false;
                        try {
                            if (this.lastinfo.length > 1) {
                                const last_data = JSON.parse(this.lastinfo);
                                // pair, mySocket[id], currentUser
                                this.mySocket = last_data.mySocket;
                                this.DigitalSCryptor = new DigitalSCryptor({
                                    default_pair: last_data.pair
                                });
                                this.currentUser = last_data.currentUser;
                                this.Stream.emit('log', `${this.username} | Loaded last data`);
                            } else {
                                need2_init_new = true;
                            }
                        } catch (e) {
                            need2_init_new = true;
                        } finally {
                            
                            if (need2_init_new) {
                                this.socket_connected = true;
                                this.mySocket = {id: ""};
                                this.Stream.emit('log', `${this.username} | VCB inited successful`);
                                resolve();
                                // this.Stream.emit('log', `${this.username} | Socket connecting ...`);
                                // let timeoutObj = setTimeout(() => {
                                //     if (this.mySocket) this.mySocket.disconnect();
                                //     reject(new Error('Init timeout'));
                                // }, 1500);
                                // try {
                                //     this.mySocket = io('https://vcbdigibank.vietcombank.com.vn', {
                                //         extraHeaders: {},
                                //         path: "/w2/socket.io"
                                //     });
                                //     this.mySocket.on('connect', () => {
                                //         clearTimeout(timeoutObj);
                                //         this.socket_connected = true;
                                //         this.Stream.emit('log', `${this.username} | Socket connected: ${this.mySocket.id}`);
                                //         this.Stream.emit('log', `${this.username} | VCB inited successful`);
                                //         resolve();
                                //     });
                                // } catch (e) {
                                //     clearTimeout(timeoutObj);
                                //     reject(e);
                                // }
                            } else {
                                this.Stream.emit('log', `${this.username} | VCB inited successful`);
                                resolve();
                            }
                        }
                    }
                });   
            }
        });
    }
    need2login () {
        return new Promise((resolve, reject) => {
            try {
                this.Stream.emit('log', `${this.username} | Checking need to Login`);
                this.db.query('SELECT lastLoginInfomation, password, loginStatus FROM banks WHERE username = ?', [this.username], (err, lastLogins) => {
                    if (err) {
                        reject(err);
                    } else {
                        if (lastLogins == undefined || lastLogins == null || (lastLogins || []).length == 0) {
                            reject(new Error('Can not find bank infomation in database'));
                        } else {
                            const lastLogin = lastLogins[0];
                            this.loginStt = lastLogin.loginStatus;
                            if (lastLogin.lastLoginInfomation == null || lastLogin.lastLoginInfomation == undefined) {
                                resolve(true);
                            } else {
                                const unsplitInfo = lastLogin.lastLoginInfomation.split('|');
                                if (unsplitInfo.length == 0) {
                                    resolve(true);
                                } else {
                                    if (lastLogin.loginStatus == 3 || lastLogin.loginStatus == 4) {
                                        const lastPwd = unsplitInfo[0];
                                        if (lastPwd == lastLogin.password) {
                                            // reject(new Error(`Lan login truoc sai mat khau, vui long kiem tra lai mat khau`));
                                            resolve(true);
                                        } else {
                                            resolve(true);
                                        }
                                    } else {
                                        resolve(true);
                                    }
                                }
                            }
                        }
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    }
    get_captcha() {
        return new Promise(async (resolve, reject) => {
            try {
                this.captcha_id = uuidv4();
                const headers = {
                    'Connection': 'keep-alive',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.26 Safari/537.36 Edg/85.0.564.13',
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Dest': 'image',
                    'Referer': 'https://vcbdigibank.vietcombank.com.vn/',
                    'Accept-Language': 'en-US,en;q=0.9'
                };

                const options = {
                    url: `https://vcbdigibank.vietcombank.com.vn/w1/get-captcha/${this.captcha_id}`,
                    headers: headers
                };

                this.captchaFileName = path.format({
                    name: this.captcha_id,
                    ext: '.jpg'
                });

                this.Stream.emit('log', `${this.username} | Dang tai captcha - ${this.captchaFileName}`);

                this.imageCaptchaPath = path.format({
                    dir: path.join(path.normalize(__dirname + '/../public/captcha_imgs')),
                    base: this.captchaFileName || 'captcha.jpg'
                });

                request(options).pipe(fs.createWriteStream(this.imageCaptchaPath)).on('close', () => {
                    this.Stream.emit('log', `${this.username} | Da tai xong captcha - ${this.captchaFileName}`);
                    resolve();
                });

            } catch (e) {
                reject(e);
            }
        });
    }
    changeCaptchaImageFileName(solvedCaptchaString) {
        return new Promise((resolve, reject) => {
            try {
                this.Stream.emit('log', `${this.username} | Changing captcha file name`);
                let RecaptchaFileName = path.format({
                    name: solvedCaptchaString || (this.solvedCaptchaString || '').trim() || 'captcha',
                    ext: '.jpg'
                });
                let imageCaptchaPathRename = path.format({
                    dir: path.join(path.normalize(__dirname + '/../public/captcha_imgs')),
                    base: RecaptchaFileName
                }) || './captcha.jpg';

                fs.renameSync(this.imageCaptchaPath, imageCaptchaPathRename);
                this.old_imageCaptchaPath = this.imageCaptchaPath;
                this.old_captchaFileName = this.captchaFileName;
                this.imageCaptchaPath = imageCaptchaPathRename;
                this.captchaFileName = RecaptchaFileName;
                this.Stream.emit('log', `${this.username} | Captcha file name has been changed`);
            } catch (e) {
                this.Stream.emit('log', `${this.username} | Change Captcha File Name ERROR: ${e.message}`);
            } finally {
                this.Stream.emit('log', `${this.username} | Captcha resolved`);
                resolve();
            }

        });
    }
    valid_captcha() {
        return new Promise((resolve, reject) => {
            this.Stream.emit('log', `${this.username} | Dang kiem tra captcha: ${this.solvedCaptchaString} | ${this.captchaFileName}`);
            const headers = {
                'Connection': 'keep-alive',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'vi',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.26 Safari/537.36 Edg/85.0.564.13',
                'Content-Type': 'application/json',
                'Origin': 'https://vcbdigibank.vietcombank.com.vn',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Dest': 'empty',
                'Referer': 'https://vcbdigibank.vietcombank.com.vn/',
                'Cookie': '_ga=GA1.3.1535919639.1595752306; _gid=GA1.3.1407703616.1595752306'
            };

            const options = {
                url: 'https://vcbdigibank.vietcombank.com.vn/w1/valid-captcha',
                method: 'POST',
                headers: headers,
                json: {
                    "captcha_id": this.captcha_id || "",
                    "captcha_text": this.solvedCaptchaString || ""
                }
            };

            request(options, async (error, response, body) => {
                if (!error && response.statusCode == 200) {
                    const data = body || {};
                    if(data.code == '00') {
                        try {
                            this.Stream.emit('log', `${this.username} | Good captcha: ${this.solvedCaptchaString} | ${this.captchaFileName} - ${data.des}`);
                            await this.changeCaptchaImageFileName();
                            resolve(data);
                        } catch (e) {
                            reject(e);
                        }
                        
                    } else {
                        reject(new Error(`valid_captcha: ${data.des || ''}`));
                    }
                } else {
                    reject(new Error('Can not valid_captcha'));
                }
            });

        });
    }
    solveCaptchaWith2Captcha(captcha_index=0) {
        return new Promise(async (resolve, reject) => {
            try {
                this.Stream.emit('log', `${this.username} | Solve captcha with captcha_index: ${captcha_index}`);
                this.solver.balanceZero(async (err, isZero) => {
                    try {
                        if (isZero == true) {
                            if (captcha_index == (this.captcha_key.length - 1)) {
                                reject(new Error(`ERROR_USER_BALANCE_ZERO`));
                            } else {
                                this.solver.setApiKey(this.captcha_key[captcha_index + 1]);
                                this.solveCaptchaWith2Captcha(captcha_index + 1).then(data => resolve(data)).catch(err => reject(err));
                            }
                        } else {
                            switch (this.captcha_service) {
                                case 'deathbycaptcha':
                                    this.solver.decodeFile(this.imageCaptchaPath, 10000, (err, result) => {
                                        if (err) {
                                            reject(new Error(`Deathbycaptcha Error: ${(err || '').toString()}`));
                                        } else {
                                            this.Stream.emit('log', `${this.username} | Deathbycaptcha: ${JSON.stringify(result)}`);
                                            resolve(result.text || '');
                                        }
                                    });
                                    break;
                                case 'twocaptcha':
                                    try {
                                        const captchaBASE64 = await imageToBase64(this.imageCaptchaPath);
                                        const result = await this.solver.decode(captchaBASE64, (err, result) => {
                                            this.Stream.emit('log', `${this.username} | TwoCaptcha: ${JSON.stringify(result)}`);
                                            resolve(result.text || '');
                                        });
                                    } catch (err) {
                                        reject(err);
                                    } finally {
                                        break;
                                    }
                                case 'anticaptcha':
                                    try {
                                        const captchaBASE64 = await imageToBase64(this.imageCaptchaPath);
                                        this.solver.decode(captchaBASE64, (err, result) => {
                                            if (err) {
                                                reject(new Error(`anticaptcha Error: ${(err || '').toString()}`));
                                            } else {
                                                this.Stream.emit('log', `${this.username} | anticaptcha: ${JSON.stringify(result)}`);
                                                resolve(result.text || '');
                                            }
                                        });
                                    } catch (err) {
                                        reject(err);
                                    } finally {
                                        break;
                                    }
                                default:
                                    try {
                                        const captchaBASE64 = await imageToBase64(this.imageCaptchaPath);
                                        this.solver.decode(captchaBASE64, {pollingInterval: 10000}, (err, result, invalid) => {
                                            if (err) {
                                                reject(new Error(`AZCaptcha Error: ${(err || '').toString()}`));
                                            } else {
                                                this.Stream.emit('log', `${this.username} | AZCaptcha: ${JSON.stringify(result)}`);
                                                resolve(result.text || '');
                                            }
                                        });
                                    } catch (err) {
                                        reject(err);
                                    } finally {
                                        break;
                                    }
                            }
                            
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }
    solveCaptcha (trytime = 2, tryfresh = 5) {
        return new Promise(async (resolve, reject) => {
            try {
                this.Stream.emit('log', `${this.username} | Solving captcha trytime=${trytime}, tryfresh=${tryfresh}`);

                this.solvedCaptchaString = await this.solveCaptchaWith2Captcha();

                this.Stream.emit('log', `${this.username} | Captcha result: ${this.solvedCaptchaString} | ${this.captchaFileName}`);

                await this.valid_captcha();

                resolve();    
            } catch (err) {
                this.Stream.emit('log', `${this.username} | Captcha error: ${err.message}`);
                if (err.message.includes('ERROR_USER_BALANCE_ZERO')) {
                    reject(err);
                } else {
                    if (tryfresh == 0) {
                        reject(new Error(`Can not solve captcha, out of fresh time: ${err.message}`));
                    } else {
                        await BPromise.delay(1000);
                        await this.get_captcha();
                        const retryData = await this.solveCaptcha(trytime - 1, tryfresh - 1);
                        resolve(retryData);
                    }
                }
            }
            
        });
    }
    close_socket() {
        return new Promise((resolve, reject) => {
            try {
                if (this.mySocket != undefined && this.mySocket['disconnect'] != undefined) {
                    const mysocket_id = (this.mySocket || {}).id;
                    this.mySocket.disconnect();
                    this.mySocket = {id:mysocket_id};
                    resolve();
                } else {
                    resolve();
                }
            } catch (e) {
                resolve();
            }
        });
    }
    close_all() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.close_socket();
                this.db.destroy();
            } catch (e) {
                
            } finally {
                resolve();
            }
        });
    }
    updateLoginStatus(loginStt) {
        return new Promise((resolve, reject) => {
            this.loginStt = loginStt;
            // "0": "Chưa login",
            // "1": "Login thành công",
            // "2": "Login thất bại",
            // "3": "Sai mật khẩu",
            // "4": "Sai tên đăng nhập",
            // "5": "Sai captcha",
            // "6": "Lỗi chưa xác định"
            this.Stream.emit('log', `${this.username} | Updating login status`);
            let query = 'UPDATE banks SET update_at = CURRENT_TIMESTAMP, loginStatus = ? WHERE username = ?';
            const lastLoginInfomation = this.password;
            let queryData = [loginStt.toString(), this.username]
            this.db.query(query, queryData, (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    if (results.changedRows == 1) {
                        this.Stream.emit('log', `${this.username} | Login status has been updated`);
                        resolve(true);
                    } else {
                        if (loginStt == 1) {
                            resolve(true);
                        } else {
                            reject(new Error(`Upate account faild: username: ${this.username} | accountNumber: ${this.accountNumber}`));
                        }
                    }
                }
            });

        });
    }
    updateCookies2DB() {
        return new Promise((resolve, reject) => {
            this.Stream.emit('log', `${this.username} | Updaing cookies`);
            let query = 'UPDATE banks SET update_at = CURRENT_TIMESTAMP, cookies = ? WHERE username = ?';
            let now_logged_data = {
                pair: this.DigitalSCryptor.pair,
                mySocket: {id: this.mySocket.id},
                currentUser: this.currentUser
            }
            let queryData = [JSON.stringify(now_logged_data), this.username];
            this.db.query(query, queryData, (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    if (results.changedRows == 1) {
                        this.Stream.emit('log', `${this.username} | Cookies has been updated`);
                        resolve(true);
                    } else {
                        reject(new Error(`Upate cookies faild: username: ${this.username} | accountNumber: ${this.accountNumber}`));
                    }
                }
            });
        });
    }
    rs(ndata) {
        return new Promise(async (resolve, reject) => {
            try {
                // console.log(this.currentUser.cookiestr);
                const headers = {
                    'Connection': 'keep-alive',
                    'Accept': 'application/json, text/plain, */*',
                    'Authorization': `Bearer ${this.currentUser.ssid}`,
                    'Accept-Language': 'vi',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.26 Safari/537.36 Edg/85.0.564.13',
                    'Content-Type': 'application/json',
                    'Origin': 'https://vcbdigibank.vietcombank.com.vn',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Dest': 'empty',
                    'Referer': 'https://vcbdigibank.vietcombank.com.vn/',
                    'Cookie': this.currentUser.cookiestr
                };
    
                const raw_data = {
                    user_name: this.currentUser.user_name,
                    client_key: this.DigitalSCryptor.pair.public,
                    data: ndata
                }
                const encrypted_data = await this.DigitalSCryptor.encryptAES(JSON.stringify(raw_data));
                // console.log(encrypted_data);
    
                const options = {
                    url: 'https://vcbdigibank.vietcombank.com.vn/w1/process-ib',
                    method: 'POST',
                    headers: headers,
                    json: { "data": encrypted_data }
                };
    
                request(options, async (error, response, body) => {
                    if (!error && response.statusCode == 200) {
                        this.Stream.emit('log', `${this.username} | Rs: ${body.des || ''}`);
                        if (body.code == '00') {
                            if (body.encrypt == '1') {
                                const decrypted_data = await this.DigitalSCryptor.decryptAES(body.data);
                                const request_obj = JSON.parse(decrypted_data);
                                if (request_obj.code == '00') {
                                    resolve(request_obj);
                                } else {
                                    this.Stream.emit('log', `${this.username} | apiService-rejected-0: ${JSON.stringify(request_obj)}`);
                                    reject(new Error(`apiService-rejected-0: ${ndata.processCode} - ${request_obj.des}`));
                                }
                                
                            } else {
                                resolve(body.data);
                            }
                        } else if (body.code == 'EXP') {
                            await this.updateLoginStatus(0);
                            reject(new Error(`Phien het han, vui long login lai`));
                        } else {
                            reject(new Error(`apiService-rejected-1: ${JSON.stringify(body)}`));
                        }
                    } else {
                        console.log('apiService-rejected:::', body);
                        reject(new Error(`Request Error: ${error}, ${(response || {}).statusCode}, ${body}, ${JSON.stringify(raw_data)}`));
                    }
                });

            } catch (e) {
                reject(e);
            }
        });
    }
    // Cái này để xử lý captcha --> Trả vè ID của capthca. Done
    process_captcha() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.get_captcha();
                await this.solveCaptcha();
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }
    login() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.process_captcha();
                const raw_data = {
                    user_name: this.username,
                    password: this.password,
                    socket_id: (this.mySocket || {}).id,
                    captcha_id: this.captcha_id,
                    clientKey: this.DigitalSCryptor.pair.public,
                    lang: "vi"
                }
                const encrypted_data = await this.DigitalSCryptor.encryptAES(JSON.stringify(raw_data));
                // console.log('encrypted_data:', encrypted_data, raw_data);

                const headers = {
                    'Connection': 'keep-alive',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'vi',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.26 Safari/537.36 Edg/85.0.564.13',
                    'Content-Type': 'application/json',
                    'Origin': 'https://vcbdigibank.vietcombank.com.vn',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Dest': 'empty',
                    'Referer': 'https://vcbdigibank.vietcombank.com.vn/'
                };

                const options = {
                    url: 'https://vcbdigibank.vietcombank.com.vn/w1/auth',
                    method: 'POST',
                    headers: headers,
                    json: { "data": encrypted_data }
                };

                request(options, async (error, response, body) => {
                    if (!error && response.statusCode == 200) {
                        const data = body || {};
                        if (data.code == '00') {
                            this.Stream.emit('log', `${this.username} | Loged: ${data.des}`);
                            try {
                                // console.log(this.DigitalSCryptor.pair.private, body);
                                const login_res = await this.DigitalSCryptor.decryptAES(data.data);
                                const res_data = JSON.parse(login_res);
                                if (res_data.code == '00') {
                                    // console.log('Login header:', response.headers);
                                    // ex_res_data = {
                                    //     "code": "00", "des": "Thành công", "token": "eyJhb...",
                                    //     "user_info": {
                                    //         "cif": "", "user_name": "0989173710", "cusIdNumber": "272620790"
                                    //         "cus_name": "NGUYEN THI MY HANH", "auto_login": 1, "idType": "IC",
                                    //         "session_id": "", "waiting_mb": 0, "receiver_otp": "0989173710",
                                    //         "defaultAccount": "0121000839335", "mobileId": "", "clientId": "",
                                    //         "lastLogin": "2020-07-26 20:46:00", "cusLevel": "NORMAL", "cusEmail": "myhanh17041997@gmail.com",
                                    //         "birthday": "1997-04-17T00:00:00", "defaultAccountCcy": "VND", "sex": "F"
                                    //     },
                                    //     "durationExpire": "5", "accessKey": "eyJ0a..."
                                    // }
                                    this.cookiestr = (response.headers['set-cookie'] || ['ssid=;']).map(item=>item.split(';')[0]).join('; ');
                                    this.currentUser = {...res_data.user_info, 
                                        accessKey: res_data.accessKey,
                                        token: res_data.token,
                                        ssid: res_data.token,
                                        cookiestr: this.cookiestr
                                    };
                                    // console.log(this.currentUser);
                                    await this.close_socket();
                                    await this.updateCookies2DB();
                                    await this.updateLoginStatus(1);
                                    resolve(res_data);
                                } else if (res_data.code ==  '3005') {
                                    await this.updateLoginStatus(4);
                                    reject(new Error(`Login fail: ${res_data.des}`));
                                } else if (res_data.code ==  '16') {
                                    await this.updateLoginStatus(3);
                                    reject(new Error(`Login fail: ${res_data.des}`));
                                } else {
                                    this.Stream.emit('log', `${this.username} | Login fail response: ${JSON.stringify(res_data)}`);
                                    await this.updateLoginStatus(6);
                                    reject(new Error(`Login fail: ${res_data.des}`));
                                }
                            } catch (e) {
                                await this.updateLoginStatus(6);
                                reject(e);
                            }
                        } else {
                            await this.updateLoginStatus(6);
                            reject(new Error(`Login: ${data.des}`));
                        }
                    } else {
                        await this.updateLoginStatus(6);
                        reject(new Error(`${this.username} | Login error: ${error}, ${(response || {}).statusCode}, ${body}`));
                    }
                });
            } catch (e) {
                reject(e);
            }
            
        });
    }
    getListAccount() {
        return new Promise((resolve, reject) => {
            const data = {
                processCode: "laydanhsachtaikhoan",
                cif: this.currentUser.cif,
                sessionId: this.currentUser.session_id,
                type: 1,
                lang: "vi"
            };
            this.rs(data).then(res => {
                resolve(res);
            }).catch(e => {
                reject(e);
            });
        });
    }
    is_logged() {
        return new Promise(async (resolve, reject) => {
            try {
                const is_need2login = await this.need2login();
                if (is_need2login == true) {
                    // kiem tra login cũ ở đây
                    try {
                        await this.getListAccount();
                        resolve(true);
                    } catch (e) {
                        this.Stream.emit('log', `${this.username} | Session da het han, dang login lai`);
                        this.DigitalSCryptor = new DigitalSCryptor();
                        await BPromise.delay(200);
                        await this.login();
                        resolve(true);
                    }
                } else {
                    // Bỏ login luôn.
                    resolve(true);
                }
            } catch (e) {
                reject(e);
            }
        });
    }
    start() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.init();
                const have_logged = await this.is_logged();
                if (have_logged) {
                    resolve();
                } else {
                    reject(new Error('Login loi...'));
                }
            } catch (e) {
                reject(e);
            }
        });
    }
    getAccountStatement(accountNo, accountType, fromDate = "27/06/2020", toDate = "27/07/2020", pageIndex = 0, lengthInPage = 100, stmtDate = "", stmtType = "") {
        // fromDate: "27/06/2020"
        // toDate: "27/07/2020"
        return new Promise((resolve, reject) => {
            const s = {
                processCode: "laysaoketaikhoan",
                cif: this.currentUser.cif,
                sessionId: this.currentUser.session_id,
                accountNo,
                accountType,
                fromDate,
                toDate,
                pageIndex,
                lengthInPage,
                stmtDate,
                stmtType,
                lang: "vi"
            };
            this.rs(s).then(rs_data => {
                resolve(rs_data);
            }).catch(err => {
                reject(err);
            })
        })
    }
    valid_date(dateinput) {
        return moment(dateinput.toString(), 'DD/MM/YYYY', true).isValid()
    }
    getAccountDetail(accountNo, accountType) {
        return new Promise((resolve, reject) => {
            const e = {
                processCode: "laychitiettaikhoan",
                cif: this.currentUser.cif,
                sessionId: this.currentUser.session_id,
                accountNo,
                accountType,
                lang: "vi"
            };
            this.rs(e).then(result => {
                resolve(result.accountDetail)
            }).catch(err => {
                reject(err)
            });
        });
    }
    chitiettaikhoan() {
        return new Promise( async (resolve, reject) => {
            try {
                const {DDAccounts} = await this.getListAccount();
                this.DDAccounts = DDAccounts;
                if (this.DDAccounts.length == 0) {
                    reject(new Error('Danh sach tai khoan trong'));
                } else {
                    this.Account = ((this.accountNumber || '').length == 0)?DDAccounts[0]:(DDAccounts.find(x => x.accountNo === this.accountNumber) || {});
                    // this.Account = DDAccounts[0];
                    const accountDetail = await this.getAccountDetail(this.Account.accountNo, this.Account.accountType);
                    resolve({ accountDetail });
                }
            } catch (e) {
                reject(e);
            }
        });
    }
    laysaoketaikhoan(begin = "27/06/2020", end = "27/07/2020") {
        return new Promise(async (resolve, reject) => {
            try {
                const {DDAccounts} = await this.getListAccount();
                this.DDAccounts = DDAccounts;
                if (this.DDAccounts.length == 0) {
                    reject(new Error('Danh sach tai khoan trong'));
                } else {
                    this.Account = ((this.accountNumber || '').length == 0)?DDAccounts[0]:(DDAccounts.find(x => x.accountNo === this.accountNumber) || {});
                    // this.Account = DDAccounts[0];
                    if (this.valid_date(begin) && this.valid_date(end)) {
                        const {transactions, nextIndex} = await this.getAccountStatement(this.Account.accountNo, this.Account.accountType, begin, end, 0, this.lengthInPage);
                        resolve({ transactions, nextIndex });
                    } else {
                        reject(new Error('Ngay thang khong hop le. Vui long format lai theo DD/MM/YYYY'));
                    }
                }
            } catch (e) {
                reject(e);
            }
        });
    }
    getBank(isFastTranfer = "1") {
        return new Promise((resolve, reject) => {
            Promise.resolve(!0).then(() => {
                const t = {
                    processCode: "laydanhsachnganhang",
                    cif: this.currentUser.cif,
                    sessionId: this.currentUser.session_id,
                    fastTransfer: isFastTranfer,
                    lang: "vi"
                };
                this.rs(t).then(l => {
                    // {
                    //     bankCode: '970416',
                    //     bankName: 'A CHAU (ACB)',
                    //     bankNameEN: 'A CHAU (ACB)',
                    //     level: '1',
                    //     fastTrans: '1'
                    // }
                    // Normal Tran
                    // {
                    //     bankCode: '79307001',
                    //     bankName: 'A CHAU (ACB)',
                    //     bankNameEN: 'A CHAU (ACB)',
                    //     level: '1',
                    //     fastTrans: '0'
                    // }
                    resolve(l.banks);
                }).catch(err => {
                    reject(err);
                })
            })
        })
    }
    formatCurrencyString(l, n) {
        if ("VND" === l)
            return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        {
            return n.toFixed(2).toString().replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1,");
        }
    }
    // --> this.listDDAccounts
    getDebitAccounts(serviceCode = "0551") {
        return new Promise((resolve, reject)=>{
            // chuyen khoan nhanh: "0551"
            this.Stream.emit('log', `${this.username} | Dang lay danh sach tai khoan Debit`);
            const t = {
                processCode: "laydanhsachtaikhoanthanhtoan",
                serviceCode: serviceCode,
                cif: this.currentUser.cif,
                sessionId: this.currentUser.session_id,
                lang: "vi"
            };
            this.rs(t).then(response=>{
                const array_map = new Map;
                response.listDDAccounts.forEach(item=>{
                    item.availBalance = this.formatCurrencyString(item.accountCurr, item.availBalance),
                    array_map.set(item.accountNo, item)
                }),
                // [
                //     {
                //         resCode: '0',
                //         accountNo: '0121000839335',
                //         newAccountNo: '0001341707',
                //         accountType: 'D',
                //         accountCurr: 'VND',
                //         branchCode: '01200',
                //         availBalance: '48,129',
                //         branchName: 'DONG NAI - TRU SO CHINH',
                //         customerName: 'NGUYEN THI MY HANH',
                //         productType: '10016'
                //     }
                // ]
                this.listDDAccounts = response.listDDAccounts;
                this.maplistDDAccounts = array_map;
                this.Stream.emit('log', `${this.username} | Da lay xong danh sach Debit`);
                resolve(response.listDDAccounts);
            }).catch(err=>{
                reject(err)
            });
        })
    }
    initTransafer247ByAccount(f_options = {}) {
        this.Stream.emit('log', `${this.username} | Dang khoi tao chuyen tien 247`);
        // feeType: "1" người chuyển trả
        // feeType: "2" người nhận trả

        // amount: "1000"
        // ccyType: "1"
        // cif: ""
        // content: "NGUYEN THI MY HANH chuyen khoan"
        // creditAccountNo: "1482597"
        // creditBankCode: "970416"
        // debitAccountNo: "0121000839335"
        // feeType: "1"
        // lang: "vi"
        // processCode: "chuyentienliennganhang_taikhoan"
        // sessionId: ""
        let n_options = {
            debitAccountNo: "", // số tài khoản nguồn (nguồn tiền)
            creditAccountNo: "1482597", //Số tài khoản cần chuyển tới
            creditBankCode: "970416", // ID của ngân hàng chuyển tới
            amount: "1000", // số tiền
            feeType: "1", // phí do ai trả
            content: "bytool", // nội dung chuyển khoản
            ccyType: "1", // chưa biết
            ...this.removeEmpty(f_options)
        };
        let {debitAccountNo, creditAccountNo, creditBankCode, amount, feeType, content, ccyType} = n_options;
        return new Promise((resolve, reject) => {
            const c = {
                processCode: "chuyentienliennganhang_taikhoan",
                debitAccountNo,
                creditAccountNo,
                creditBankCode,
                amount: String(amount),
                feeType,
                content,
                ccyType,
                cif: this.currentUser.cif,
                sessionId: this.currentUser.session_id,
                lang: "vi"
            };
            this.rs(c).then(l => {
                this.Stream.emit('log', `${this.username} | Da tao xong lenh chuyen tien`);
                resolve(l.transaction);
            }).catch(err => {
                reject(err);
            });
        });
    }
    chontaikhoanchuyentien() {
        if (this.accountNumber != undefined && this.accountNumber.length != 0) {
            return this.accountNumber;
        } else {
            return this.listDDAccounts[0].accountNo;
        }
    }
    acceptTransaction(tranId) {
        // captcha_id: "489b18f1-63af-3a67-55d2-05357196a90a"
        // cif: ""
        // lang: "vi"
        // processCode: "xacnhangiaodich"
        // sessionId: ""
        // tranId: "744350158"
        // type: "1"
        this.Stream.emit('log', `${this.username} | Xac nhan thong tin chuyen tien`);
        return new Promise((resolve, e) => {
            const r = {
                processCode: "xacnhangiaodich",
                tranId: tranId,
                cif: this.currentUser.cif,
                sessionId: this.currentUser.session_id,
                type: "1",
                captcha_id: this.captcha_id,
                lang: "vi"
            };
            this.rs(r).then(l => {
                this.Stream.emit('log', `${this.username} | Da xac nhan xong lenh chuyen tien`);
                resolve(l);
            }).catch(err => {
                reject(err);
            })
        })
    }
    khoitao_chuyentien247(c_options = {}) {
        return new Promise(async (resolve, reject) => {
            try {
                this.Stream.emit('log', `${this.username} | Bat dau tao lenh chuyen tien`);
                let { creditAccountNo, creditBankCode, amount, content, feeType } = c_options;
                // chuyentien247 serviceCode = "0551"
                await this.getDebitAccounts("0551");
                const debitAccountNo = this.chontaikhoanchuyentien();
                const transaction = await this.initTransafer247ByAccount({
                    debitAccountNo, // số tài khoản nguồn (nguồn tiền)
                    creditAccountNo, //Số tài khoản cần chuyển tới
                    creditBankCode, // ID của ngân hàng chuyển tới
                    amount, // số tiền
                    feeType, // "1" người chuyển trả | "2" người nhận trả
                    content, // nội dung chuyển khoản
                    ccyType: "1", // chưa biết
                });
                const { tranId } = transaction;
                this.Stream.emit('log', `${this.username} | Da tao xong giao dich chuyen tien 247, trandId: ${tranId}`);
                this.Stream.emit('log', `${this.username} | Xac nhan captcha cho giao dich chuyen tien 247`);
                await this.process_captcha();
                const accept_resposne = await this.acceptTransaction(tranId);
                resolve({transaction, accept_resposne});
            } catch (err) {
                reject(err);
            }
        });
    }
    confirmTransaction(tranId = "", otp ="123456") {
        // challenge: ""
        // cif: ""
        // lang: "vi"
        // otp: "123445"
        // processCode: "xacthucgiaodich"
        // sessionId: ""
        // tranId: "744361075"
        this.Stream.emit('log', `${this.username} | Dang xac nhan OTP`);
        return new Promise((resolve, reject) => {
            const r = {
                processCode: "xacthucgiaodich",
                tranId,
                otp,
                challenge: "",
                cif: this.currentUser.cif,
                sessionId: this.currentUser.session_id,
                lang: "vi"
            };
            this.rs(r).then(l => {
                this.Stream.emit('log', `${this.username} | OTP Verified`);
                resolve(l);
            }).catch(err => {
                reject(err);
            });
        })
    }
    xacnhan_chuyentien(x_options = {}) {
        return new Promise(async (resolve, reject) => {
            try {
                let n_options = {
                    tranId: "",
                    otp: "",
                    ...this.removeEmpty(x_options)
                };
                const { tranId, otp } = n_options;
                const confirm_response = await this.confirmTransaction(tranId, otp);
                resolve(confirm_response);
            } catch (err) {
                reject(err);
            }
        });
    }
    initTranferToday(f_options = {}) {
        // activeTouch: "0"
        // amount: "1000"
        // ccyType: undefined
        // cif: ""
        // content: "NGUYEN THI MY HANH chuyen khoan"
        // creditAccountNo: "0121000876896"
        // debitAccountNo: "0121000839335"
        // feeType: "1"
        // lang: "vi"
        // processCode: "chuyentientronghethong_ngay"
        // sessionId: ""
        let n_options = {
            debitAccountNo: "", // số tài khoản nguồn (nguồn tiền)
            creditAccountNo: "0121000876896", //Số tài khoản cần chuyển tới
            amount: "1000", // số tiền
            feeType: "1", // phí do ai trả
            content: "bytool", // nội dung chuyển khoản
            ...this.removeEmpty(f_options)
        };
        let { debitAccountNo, creditAccountNo, amount, feeType, content } = n_options;
        return new Promise((resolve, reject) => {
            const s = {
                processCode: "chuyentientronghethong_ngay",
                debitAccountNo,
                creditAccountNo,
                amount,
                feeType,
                content,
                activeTouch: "0",
                cif: this.currentUser.cif,
                sessionId: this.currentUser.session_id,
                lang: "vi",
                ccyType: undefined
            };
            this.rs(s).then(l => {
                resolve(l.transaction);
            }).catch(err => {
                reject(err);
            })
        })
    }
    khoitao_chuyentientrongvcb(c_options = {}) {
        return new Promise(async (resolve, reject) => {
            try {
                let { creditAccountNo, amount, content, feeType } = c_options;
                await this.getDebitAccounts("0540,0541,0552,0553");
                const debitAccountNo = this.chontaikhoanchuyentien();
                const transaction = await this.initTranferToday({
                    creditAccountNo, debitAccountNo, amount, content, feeType
                });
                const { tranId } = transaction;
                this.Stream.emit('log', `${this.username} | Da tao xong giao dich chuyen tien 247, trandId: ${tranId}`);
                this.Stream.emit('log', `${this.username} | Xac nhan captcha cho giao dich chuyen tien 247`);
                await this.process_captcha();
                const accept_resposne = await this.acceptTransaction(tranId);
                resolve({transaction, accept_resposne});
            } catch (err) {
                reject(err);
            }
        });
    }
}



module.exports = VCBDigital;
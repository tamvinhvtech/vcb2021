module.exports = {
    port: 9898,
    db_port: 3308,
    db_host: 'localhost',
    db_user: 'root',
    db_password: '',
    db_database: 'vcb_history',
    timeZone: "Asia/Ho_Chi_Minh",
    numberMinute2ScanPaymentWhenInsertNewPayment: 10,
    bankLimit: 0,
    detect_ip: false,
    access_ip: ["127.0.0.1"],
    captcha_service: "anticaptcha", // azcaptcha, deathbycaptcha, twocaptcha, anticaptcha
    captcha_key: [''], //deathbycaptcha -- username|password
    lengthInPage: 500 
}
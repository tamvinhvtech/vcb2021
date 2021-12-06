const path = require('path');
const express = require('express');
const router = express.Router();
const errorsList = require(path.normalize(__dirname + '/../configs/statusListcode.json'));
const jwt = require('jsonwebtoken');
const config = require(path.normalize(__dirname + '/../configs/config'));
const validateSchema = require(path.normalize(__dirname + '/../configs/validateSchema'));
const transactionStatuses = require(path.normalize(__dirname + '/../configs/transactionStatuses'));
const vcbLoginStatus = require(path.normalize(__dirname + '/../configs/vcbLoginStatus'));
const payment = require(path.normalize(__dirname + '/../controllers/payment'));
const moment = require('moment');
const jsv = require('json-validator');
const customValidateGetPayment = require(path.normalize(__dirname + '/../middlewares/customValidateGetPayment'));
const validateGetTransactions = require(path.normalize(__dirname + '/../middlewares/validateGetTransactions'));
const db = require(path.normalize(__dirname + '/../payments/database'));
const VCBDigital = require(__dirname + '/../payments/vcbdigital');
const vcb_tranfer247_bankcode = require(path.normalize(__dirname + '/../configs/vcb_tranfer247_bankcode'));

router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server OK'
  });
});

router.post('/transactions', async (req, res) => {
  try {
    try {
      if (config.detect_ip == false || config.access_ip.includes(req.ipInfo.ip)) {
        const { accountNumber, username, password, begin, end } = req.body;

        const myvcb = new VCBDigital({
          username, password, captcha_key: config.captcha_key || [''],
          lengthInPage: 500, accountNumber: accountNumber || '', captcha_service: config.captcha_service
        });

        myvcb.Stream.on('log', data => console.log('log:', data));

        await myvcb.start();

        const saoke = await myvcb.laysaoketaikhoan(begin, end);

        // await myvcb.close_all();

        res.status(200).json({
          success: true,
          message: `Success`,
          ...saoke
        });
      } else {
        console.log('Denied access from:', req.ipInfo);
        res.status(200).json({
          success: false,
          message: `Access Denied from: ${req.ipInfo.ip}`,
          ipInfo: req.ipInfo
        });
      }

    } catch (e) {
      res.status(200).json({
        success: false,
        message: `Error: ${e.message}`
      });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.post('/balance', async (req, res) => {
  try {
    try {
      if (config.detect_ip == false || config.access_ip.includes(req.ipInfo.ip)) {
        const { accountNumber, username, password } = req.body;

        const myvcb = new VCBDigital({
          username, password, captcha_key: config.captcha_key || [''],
          lengthInPage: 500, accountNumber: accountNumber || '', captcha_service: config.captcha_service
        });

        myvcb.Stream.on('log', data => console.log('log:', data));

        await myvcb.start();

        const chitiettk = await myvcb.chitiettaikhoan();

        // await myvcb.close_all();

        res.status(200).json({
          success: true,
          message: `Success`,
          ...chitiettk
        });
      } else {
        console.log('Denied access from:', req.ipInfo);
        res.status(200).json({
          success: false,
          message: `Access Denied from: ${req.ipInfo.ip}`,
          ipInfo: req.ipInfo
        });
      }

    } catch (e) {
      res.status(200).json({
        success: false,
        message: `Error: ${e.message}`
      });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.get('/bankcode_tranfer247', (req, res) => {
  try {
    try {
      if (config.detect_ip == false || config.access_ip.includes(req.ipInfo.ip)) {

        res.status(200).json({
          success: true,
          message: `Success`,
          banks: vcb_tranfer247_bankcode
        });

      } else {
        console.log('Denied access from:', req.ipInfo);
        res.status(200).json({
          success: false,
          message: `Access Denied from: ${req.ipInfo.ip}`,
          ipInfo: req.ipInfo
        });
      }

    } catch (e) {
      res.status(200).json({
        success: false,
        message: `Error: ${e.message}`
      });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.post('/tranfer247', async (req, res) => {
  try {
    try {
      if (config.detect_ip == false || config.access_ip.includes(req.ipInfo.ip)) {
        const { accountNumber, username, password, content, tranfer_to, bank_code, amount, feeType } = req.body;

        const myvcb = new VCBDigital({
          username, password, captcha_key: config.captcha_key || [''],
          lengthInPage: 500, accountNumber: accountNumber || '', captcha_service: config.captcha_service
        });

        myvcb.Stream.on('log', data => console.log('log:', data));

        await myvcb.start();

        const ktct = await myvcb.khoitao_chuyentien247({
            creditAccountNo: tranfer_to || "1482597",
            creditBankCode: bank_code || "970416",
            amount: parseInt(amount) || 1000,
            content: content || "bytool",
            feeType: feeType || "1"
        });

        // await myvcb.close_all();

        res.status(200).json({
          success: true,
          message: `Success`,
          tranfer_type: "247",
          ...ktct
        });
      } else {
        console.log('Denied access from:', req.ipInfo);
        res.status(200).json({
          success: false,
          message: `Access Denied from: ${req.ipInfo.ip}`,
          ipInfo: req.ipInfo
        });
      }

    } catch (e) {
      res.status(200).json({
        success: false,
        message: `Error: ${e.message}`
      });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.post('/tranfer_local', async (req, res) => {
  try {
    try {
      if (config.detect_ip == false || config.access_ip.includes(req.ipInfo.ip)) {
        const { accountNumber, username, password, tranfer_to, amount, content, feeType } = req.body;

        const myvcb = new VCBDigital({
          username, password, captcha_key: config.captcha_key || [''],
          lengthInPage: 500, accountNumber: accountNumber || '', captcha_service: config.captcha_service
        });

        myvcb.Stream.on('log', data => console.log('log:', data));

        await myvcb.start();

        const ktct = await myvcb.khoitao_chuyentientrongvcb({
          creditAccountNo: tranfer_to || "0121000876896",
          amount: parseInt(amount) || 1000,
          content: content || "bytool",
          feeType: feeType || "1"
        });

        res.status(200).json({
          success: true,
          message: `Success`,
          tranfer_type: "local",
          ...ktct
        });
      } else {
        console.log('Denied access from:', req.ipInfo);
        res.status(200).json({
          success: false,
          message: `Access Denied from: ${req.ipInfo.ip}`,
          ipInfo: req.ipInfo
        });
      }

    } catch (e) {
      res.status(200).json({
        success: false,
        message: `Error: ${e.message}`
      });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.post('/confirm_tranfer', async (req, res) => {
  try {
    try {
      if (config.detect_ip == false || config.access_ip.includes(req.ipInfo.ip)) {
        const { accountNumber, username, password, tranId, otp } = req.body;

        const myvcb = new VCBDigital({
          username, password, captcha_key: config.captcha_key || [''],
          lengthInPage: 500, accountNumber: accountNumber || '', captcha_service: config.captcha_service
        });

        myvcb.Stream.on('log', data => console.log('log:', data));

        await myvcb.start();

        const xnct = await myvcb.xacnhan_chuyentien({
          tranId: tranId || "",
          otp: otp || "123456"
        });

        res.status(200).json({
          success: true,
          message: `Success`,
          ...xnct
        });
      } else {
        console.log('Denied access from:', req.ipInfo);
        res.status(200).json({
          success: false,
          message: `Access Denied from: ${req.ipInfo.ip}`,
          ipInfo: req.ipInfo
        });
      }

    } catch (e) {
      res.status(200).json({
        success: false,
        message: `Error: ${e.message}`
      });
    }
  } catch (e) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router

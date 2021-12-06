const path = require('path');
const jsv = require('json-validator');
const errorsList = require(path.normalize(__dirname + '/../configs/statusListcode.json'));
const validateSchema = require(path.normalize(__dirname + '/../configs/validateSchema'));

module.exports = (req, res, next) => {
  try {
    req.customPaymentRequestData = {
      customKey: "paymentID",
      customQueryKey: "id"
    }
    jsv.validate(req.query, validateSchema.getPayment, (err, messages) => {
      if(err) {
        console.error(err);
        res.status(500).json({
          success: false,
          message: errorsList['500']
        });
      }
      if (Object.keys(messages).length > 0) {
        jsv.validate(req.query, validateSchema.customGetPayment, (err, customGetPaymentmessages) => {
          if(err) {
            console.error(err);
            res.status(500).json({
              success: false,
              message: errorsList['500']
            });
          }
          if (Object.keys(customGetPaymentmessages).length > 0) {
            res.status(200).json({
              success: false,
              message: 'Bad request',
              error: ''.concat(JSON.stringify(messages), JSON.stringify(customGetPaymentmessages))
            });
          } else {
            req.customPaymentRequestData.customKey = "customPaymentID";
            req.customPaymentRequestData.customQueryKey = "customPaymentID";
            next();
          }
        })
      } else {
        next();
      }
    })
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: errorsList['500']
    });
  }
}
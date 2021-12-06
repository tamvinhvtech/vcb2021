const path = require('path');
const config = require(path.normalize(__dirname + '/../configs/config'));

const updatetransactionStatus = (db, id, transactionStatus, cb) => {
  try {
    let query = 'UPDATE payments SET update_at = CURRENT_TIMESTAMP, transactionStatus = ? WHERE id = ?';
    let queryData = [transactionStatus, id]
    db.query(query, queryData, err => {
      if (err) {
        cb(err)
      } else {
        // console.log(query);
        if (query.changes == 1) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      }
    });
  } catch (e) {
    cb(e);
  }
}

const checkBankLimit = (db) => {
  return new Promise((resolve, reject) => {
    if (config.bankLimit === 0) {
      resolve(false);
    } else {
      db.query('SELECT COUNT(*) AS total_bank FROM banks', (err, counterRow) => {
        if (err) {
          reject(err);
        } else {
          if ((counterRow || []).length == 0) {
            resolve(false);
          } else {
            console.log(counterRow);
            if (counterRow[0].total_bank >= config.bankLimit) {
              resolve(true);
            } else {
              resolve(false);
            }
          }
          
        }
      });  
    }
  });
}

module.exports = {
  updatetransactionStatus,
  checkBankLimit
};

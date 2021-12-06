var http = require('http');
const express = require('express');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const path = require('path');
const date = require('date-and-time');
const moment = require('moment');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser')
// const mysql = require('mysql');
const config = require('./configs/config');
const cors = require('cors');
const morgan = require('morgan');
const serveIndex = require('serve-index');
const expressip = require('express-ip');
const timeouthdl = require('express-timeout-handler');

const port = config.port

// const con = require('./controllers/database');

app.use(timeouthdl.handler({
  timeout: 120000,
  onTimeout: function(req, res) {
    res.status(200).json({
      success: false,
      message: `Error: Service unavailable. Please retry.`
    });
  },
 
  onDelayedResponse: function(req, method, args, requestTime) {
    console.error(`Attempted to call ${method} after timeout`);
  },
  disable: ['write', 'setHeaders', 'send', 'json', 'end']
}));


app.use(cors());
app.use('/captcha_imgs', express.static(path.join(__dirname, 'public/captcha_imgs')))
app.use('/captcha_imgs', serveIndex(path.join(__dirname, 'public/captcha_imgs')))
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(expressip().getIpInfoMiddleware);
app.use(morgan('dev'));


// Import Router
const route_vcb = require('./routers/vcb');


// Use Router
app.get('/', (req, res) => {
  const ipInfo = req.ipInfo;
  res.status(200).json({
    server: "work",
    message: `Hey, you are browsing from ${ipInfo.city}, ${ipInfo.country}`,
    ipInfo
  });
});
app.use('/api/vcb', route_vcb);

app.use(function(req, res, next) {
  res.send('404');
});

server.listen(port, () => console.log(`Server listening on port ${port}!`));
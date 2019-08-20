const config = require('./config');
const logger = require('../logger/log')(config.serviceName, config.logLevel, config.prettyPrintJson);
const net = require('net');
const amqplibFrame = require('amqplib/lib/frame');
const amqplibDefs = require('amqplib/lib/defs');
const axios = require('axios');
const querystring = require('querystring');

function waitForNetSocketConnection(socket, callback) {
    setTimeout(
        function () {
            if (!socket.connecting) {
                if (callback != null) {
                    callback();
                }
                return;

            } else {
                waitForNetSocketConnection(socket, callback);
            }

        }, 5); // wait 5 milisecond for the connection...
}

function sendNetMessages(socket, queue) {

    waitForNetSocketConnection(socket, () => {
        //logger.log("debug", "Sending messages (net)", {queue: queue});
        while (queue.length > 0) {
            socket.write(queue.shift());
        }
    });
}


const serverOptions = {};

const server = net.createServer(serverOptions);

server.on('close', function close() {
    logger.log("debug", "server event close");
});

server.on('connection', function connection(serverSocket) {
    logger.log("debug", "server event connection");

    const clientOptions = {
        host: config.amqp_host,
        port: config.amqp_port
    };

    serverSocket.bgwClientSocket = net.connect(clientOptions);
    serverSocket.bgwClientSocket.bgwQueue = [];
    serverSocket.bgwClientSocket.on('close', () => {
        logger.log("debug", "clientSocket (net) event close");
    });
    serverSocket.bgwClientSocket.on('connect', () => {
        logger.log("debug", "clientSocket (net) event connect");
    });
    serverSocket.bgwClientSocket.on('data', (data) => {
        serverSocket.bgwClientSocket.bgwQueue.push(data);
        let parsed = amqplibFrame.parseFrame(data, 13421772890);
        //logger.log("debug", "clientSocket (net) event data (incoming), forward to serverSocket", {parsed: parsed});
        let decoded;
        try {
            decoded = amqplibFrame.decodeFrame(parsed);
        } catch (error) {
            logger.log("error", "error while parsing", {error: error});
        }

        //logger.log("debug", "clientSocket (net) event data (incoming), forward to serverSocket", {decoded: decoded});
        //logger.log("debug", "clientSocket (net) event data (incoming), forward to serverSocket", {queue: serverSocket.bgwClientSocket.bgwQueue});
        //waitForWebSocketConnectionAndAuthorization(serverSocket, () => {
        sendNetMessages(serverSocket, serverSocket.bgwClientSocket.bgwQueue);
        // });
    });
    serverSocket.bgwClientSocket.on('drain', () => {
        logger.log("debug", "clientSocket (net) event drain");
    });
    serverSocket.bgwClientSocket.on('end', () => {
        logger.log("debug", "clientSocket (net) event end");
    });
    serverSocket.bgwClientSocket.on('error', (error) => {
        logger.log("error", "clientSocket (net) event error", {errorMessage: error.message});
    });
    serverSocket.bgwClientSocket.on('lookup', () => {
        logger.log("debug", "clientSocket (net) event lookup");
    });
    serverSocket.bgwClientSocket.on('ready', () => {
        logger.log("debug", "clientSocket (net) event ready");
    });
    serverSocket.bgwClientSocket.on('timeout', () => {
        logger.log("debug", "clientSocket (net) event timeout");
    });

    serverSocket.on('close', () => {
        logger.log("debug", "serverSocket event close");
    });
    serverSocket.on('connect', () => {
        logger.log("debug", "serverSocket event connect");
    });
    serverSocket.on('data', async (data) => {
        //logger.log("debug", "serverSocket event data (incoming)", {data: data});

        let parsed = amqplibFrame.parseFrame(data, 100000000000);
        //logger.log("debug", "serverSocket event data (incoming)", {parsed: parsed});
        let decoded;
        try {
            decoded = amqplibFrame.decodeFrame(parsed);
        } catch (error) {
            logger.log("error", "error while parsing", {error: error});
        }
        //logger.log("debug", "serverSocket event data (incoming)", {decoded: decoded});
        if (decoded && decoded.fields && decoded.fields.response) {
            //logger.log("debug", "serverSocket event data (incoming)", {parsed: parsed});
            logger.log("debug", "serverSocket event data (incoming)", {decoded: decoded});
            let authString = decoded.fields.response.toString("utf8");
            logger.log("debug", "authString: " + authString);
            let authStringSplit = authString.split("\0");
            logger.log("debug", "authStringSplit: " + authStringSplit);
            let username = authStringSplit[1];
            let password = authStringSplit[2];

            let response;
            let requestData = querystring.stringify({
                grant_type: 'password',
                audience: "rabbitmq",
                username: "jannis.warnat@fit.fraunhofer.de",
                password: "a1ONq;|yD/WZ:I,W5eVjH",
                client_id: "MlOrd9wY4wZk3wOGAXQrUIMhcCz28Fjj",
                client_secret: "8Z0DYPR3Abs6SY7wzUTi8i35XOOijuJBmp0hCD8KOHrx1-1yvAi5BV5OT5Nomtng",
                scope: "rabbitmq.read:*/* rabbitmq.write:*/* rabbitmq.configure:*/*"
            });

            try {
                response = await axios({
                    method: 'post',
                    url: "https://bgw-dev.eu.auth0.com/oauth/token",
                    data: requestData
                });
            } catch (error) {
                logger.log('error', 'Error in auth0', {errorName: error.name, errorMessage: error.message});
            }

            logger.log("debug", "auth0 response.data", response.data);
            if (response.data.access_token) {
                decoded.fields.response = Buffer.from("\0" + "username" + "\0" + response.data.access_token, 'utf8');
                //replace access token with manually created token (via code_jwt) because of https://github.com/rabbitmq/rabbitmq-auth-backend-oauth2/issues/24
                decoded.fields.response = Buffer.from("\0" + "username" + "\0" + "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJodHRwczovL2xvY2FsaG9zdDo0NDQvYmd3X3J1bGVzIjoiQU1RUC8rLzE5Mi4xNjguOTguMTAwLzU2NzEvLy8rLyMgSFRUUFMvR0VULyMgSFRUUFMvUFVULyMgSFRUUFMvREVMRVRFLyMgTVFUVC8jIFdTL0NPTk5FQ1QvKy8rLyMgV1MvQ09OTkVDVC8rLysiLCJpc3MiOiJodHRwczovL2Jndy1kZXYuZXUuYXV0aDAuY29tLyIsInN1YiI6ImF1dGgwfDVjODhjZjZiMjFmMDc0MDVhNjA1YjM2ZCIsImF1ZCI6WyJyYWJiaXRtcSJdLCJpYXQiOjE1NTM4NDUzNzUsImV4cCI6MTU1NTQyMzM2NCwiYXpwIjoiTWxPcmQ5d1k0d1prM3dPR0FYUXJVSU1oY0N6MjhGamoiLCJzY29wZSI6WyJyYWJiaXRtcS5yZWFkOiovKiIsInJhYmJpdG1xLndyaXRlOiovKiIsInJhYmJpdG1xLmNvbmZpZ3VyZToqLyoiXSwiZ3R5IjoicGFzc3dvcmQiLCJqdGkiOiJmMDBjZDQ0MS1kYzAzLTQ2ZTQtYTJlNy1hMmNjMzA4ODk2YTIifQ.oWrn0kwGJvf6cfIEIt5ABYbNM_aisfLMsICavZgpWT04tr5z_9ThgQsn2ltSCbeZbgvLzSdC7daVhPOCBz6vhbRrImgn1ZPiNCxyBz5sDM1lHSNkkssDIudQ2_-kzAXEMR8Splu5aGq-PalX0u5m_2sssJHLqBZNFiytuz5fjvu0Gt4L4CtnWl7QZxT6hSG9WfIxrHioZoM2urTDXdAQOcWBLb3QAqEgLcVdUxxIvjPsDcnkaytQKduqqSw3iqKSXWC1gyU87EUKL64RIJBBb4bc2mW1JW4X3qUcoGP0D3BNn0agadZVxwyBi3kbLDQB_60Ssd4mZFn7QJQkSnFGppwoR9vuxp87LtzGhlYN6JJxR8xmNasMKp9YbbSiysfXdM04iJJbSWah1f7EWl3l-zggpPNnVO21sD_u9Fh5Q64mJ9LHXJrZfebRn88VTwIIg4kSxqXcL0c82FDjas_LDqILH5sY1gXmzDurlvaZfktlVVTGXMOI492wNEbwuxgXjzvNktqNDH9Te9EyXB9mdS6kgVY2KTloVrOTH6a_fOCL0kN99ff1AJCzsG7DYJ5unGESIfdVFEKc7HXM6SRBBNtozisO4522WnEIbs7WoQ9m0ZMEjopC71MNuAG_vb654tiK58eGJ9fDk_hZ-xUG0mv39GxR8921o-rVMrOVDaA", 'utf8');

                //logger.log("debug","decoded.fields.response", decoded.fields.response);
                data = amqplibDefs.encodeMethod(decoded.id,decoded.channel,decoded.fields);
            }


        }
        serverSocket.bgwQueue.push(data);
        //waitForWebSocketConnectionAndAuthorization(serverSocket, () => {
        sendNetMessages(serverSocket.bgwClientSocket, serverSocket.bgwQueue);


    });
    serverSocket.bgwQueue = [];

    serverSocket.on('drain', () => {
        logger.log("debug", "serverSocket event drain");
    });
    serverSocket.on('end', () => {
        logger.log("debug", "serverSocket event end");
    });
    serverSocket.on('error', (error) => {
        logger.log("error", "cserverSocket event error", {errorMessage: error.message});
    });
    serverSocket.on('lookup', () => {
        logger.log("debug", "serverSocket event lookup");
    });
    serverSocket.on('ready', () => {
        logger.log("debug", "serverSocket event ready");
    });
    serverSocket.on('timeout', () => {
        logger.log("debug", "serverSocket) event timeout");
    });

});

server.on('error', function error(error) {
    logger.log("debug", "server event error", {error: error});
});

server.on('listening', function listening() {
    logger.log("debug", "server event listening");
});

server.listen(config.bind_port, config.bind_address);

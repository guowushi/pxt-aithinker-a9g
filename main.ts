/**
 * MakeCode editor extension for AiThinker A9G  by guowushi@qq.com
 */
//% block="A9G" weight=100 color=#ff8f3f icon="\uf043"
namespace A9G {
    //network APN name, defined by user in initialization of network functions
    let actualApnName = "internet";
    //switches for debug purposes
    let echoEnabled = false; //should be alsways on false during normal operation
    let mqttSubscribeTopics: string[] = []; //订阅的主题

    let httpsConnected = false; //HTTP连接成功标志
    let requestFailed = false; //请求失败标志

    //定义经度和维度
    let Latitude = ""
    let Longitude = ""


    /**
     * 
     */
    function SetupHandlers() {
        //attach listener
        usbLogger.info(`Handlers init...`);
        if (!echoEnabled) {  
            serial.onDataReceived("+", function () {
                basic.pause(50);
                let dataRaw = serial.readString();
                let data = dataRaw.substr(dataRaw.indexOf("+"), dataRaw.length);
                //MQTT subscription received
                if (data.includes("SMSUB:")) { 
                    for (let i = 0; i < mqttSubscribeTopics.length; i++) {
                        if (data.includes(mqttSubscribeTopics[i])) {
                            let message = (data.split('","')[1]); // extract message from AT Response
                            usbLogger.info(`MQTT subscription on topic: "${mqttSubscribeTopics[i]}" received content:"${message.slice(0, -3)}"`);
                            mqttSubscribeHandler(mqttSubscribeTopics[i], message.slice(0, -3))
                        }
                    }
                } else if (data.includes("CMTI:")) { //收到SMS
                    let msgId = cloudConnectorUtils.trimString(data.split(",")[1]);
                    let smsRaw = doSendAtCommand("AT+CMGR=" + msgId);
                    let smsContent = cloudConnectorUtils.trimString(smsRaw.split("\n")[2]);
                    let smsHeader = smsRaw.split("\n")[1];
                    let senderPhoneNum = (smsHeader.split(","))[1];
                    senderPhoneNum = senderPhoneNum.slice(1, senderPhoneNum.length - 1);
                    usbLogger.info(`Received SMS with id: ${msgId}, message: ${smsContent}`);
                    smsReceivedHandler(senderPhoneNum, smsContent);
                    doSendAtCommand("AT+CMGD=0,1") // 删除已读短信
                } else if (data.includes("SHREQ:")) {
                    let dataSplit = data.split(",");
                    let responseCode = dataSplit[1];
                    let responseLength = dataSplit[2];
                    usbLogger.info(`Got http response. Code: ${responseCode}, content length: ${responseLength}`);
                    if (responseLength.includes("700")) { //this actually means error
                        requestFailed = true;
                        usbLogger.error(`Request failed`)
                    } else if (responseLength.includes("680")) { //this is fine
                        requestFailed = false
                    }
                } else if (data.includes("SHSTATE: 0")) {
                    usbLogger.info(`Https connection broke`);
                    httpsConnected = false
                }
            })
        }
    }
    /**
     * 将整数转16进制
     * @param num 
     */
    function inttohex(num: number) {
        let n = 0
        let a = []
        let k = 0
        let m = 0
        let hex = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F']
        let result = ""

        while (num > 0) {
            n = num % 16
            a[k++] = n
            num = parseInt((num / 16).toString())
        }
        for (k = k - 1; k >= 0; k--) {
            m = a[k]
            result += hex[m]
        }
        return result
    }

    /**
     * 确保GSM连接
     */
    function EnsureGsmConnection() {
        let gsmStatus = GsmRegistrationStatus();
        while (!(gsmStatus == 1 || gsmStatus == 5)) {
            gsmStatus = GsmRegistrationStatus();
            basic.pause(500);
            usbLogger.info(`Waiting for GSM network. GSM status was ${gsmStatus}`)
        }
    }


    /**
     * 确保GPRS连接(internal function)
     */
    function EnsureGprsConnection() {
        doSendAtCommand('AT+CNACT=1,"' + actualApnName + '"');
        basic.pause(1000);
        let netStatus = doSendAtCommand('AT+CNACT?');
        let tries = 0;
        while (!netStatus.includes("+CNACT: 1")) {
            if (tries >= 8) {
                doSendAtCommand('AT+CNACT=1,"' + actualApnName + '"');
                tries = 0
            }
            basic.pause(1000);
            usbLogger.info(`Waiting for GPRS network connection`);
            netStatus = doSendAtCommand('AT+CNACT?');
            tries++
        }
    }

    /**
     * 发送AT命令 (internal function)
     * @param atCommand AT命令字符串
     * @param timeout   超时时间
     * @param useNewLine 是否新行
     * @param forceLogDisable  
     * @param additionalWaitTime 额外等待时间
     */
    function doSendAtCommand(atCommand: string, timeout = 1000, useNewLine = true, forceLogDisable = false, additionalWaitTime = 0): string {
        serial.readString(); //先清空buffer
        if (useNewLine) {
            serial.writeLine(atCommand)
        } else {
            serial.writeString(atCommand)
        }

        let startTs = input.runningTime();
        let buffer = "";
        // 读取串口直到超时
        while ((input.runningTime() - startTs <= timeout) || (timeout == -1)) {
            buffer += serial.readString();
            // 缓存中包含OK或ERROR字符，则说明AT命令执行完成
            if (buffer.includes("OK") || buffer.includes("ERROR")) {
                break
            }
        }

        if (additionalWaitTime > 0) {
            basic.pause(additionalWaitTime);
            buffer += serial.readString()
        }
        //for criticial AT command usb logging should be disabled, due to stability issues
        if (!forceLogDisable) {
            usbLogger.trace(`Command: ${atCommand}\r\nResponse: ${buffer}`);
        }
        return buffer
    }

    /**
     * 发送AT指令，并检查AT响应（包含OK返回True；否则返回False）
     * @param atCommand AT命令
     * @param limit 次数
     */
    function SendAtCommandCheckAck(atCommand: string, limit = 5): boolean {
        let tries = 0;
        let modemResponse = doSendAtCommand(atCommand, -1);
        while (!modemResponse.includes("OK")) {
            if (tries > limit) {
                return false
            }
            modemResponse = doSendAtCommand(atCommand, -1);
            basic.pause(100 * tries); //每次失败后增加等待时间
            tries++

        }
        return true
    }
    /**
     * 初始化A9G模块
     * @param tx 模块串口TX端对应的引脚 ,如 SerialPin.P2
     * @param rx 模块串口RX端对应的引脚 ，如SerialPin.P1
     */
    //% block="初始化A9G模块,TX: $tx RX: $rx"
    export function InitA9G(tx: SerialPin, rx: SerialPin) {
        /*
        serial.redirect(
            tx,
            rx,
            BaudRate.BaudRate115200
        )*/
        if (!usbLogger.initialised) {
            usbLogger.init(tx, rx, BaudRate.BaudRate115200, usbLogger.LoggingLevel.INFO)
        }
         //发送AT指令，返回OK则说明正常
         let atResponse = doSendAtCommand("AT");

         while (!atResponse.includes("OK")) {
             atResponse = doSendAtCommand("AT", 1000);
             usbLogger.info(`Trying to comunicate with modem...`)
         }
    }

    function initLoggerIfNotInitialised() {
        if (!usbLogger.initialised) {
            usbLogger.init(SerialPin.P8, SerialPin.P16, BaudRate.BaudRate115200, usbLogger.LoggingLevel.INFO)
        }
    }
    /**
     * 
     */
    //% weight=100 blockId="A9G.init"
    //% group="1. Setup: "
    //% block="初始化A9G模块""
    function init() {
        initLoggerIfNotInitialised();
        //发送AT指令，返回OK则说明正常
        let atResponse = doSendAtCommand("AT");

        while (!atResponse.includes("OK")) {
            atResponse = doSendAtCommand("AT", 1000);
            usbLogger.info(`Trying to comunicate with modem...`)
        }
        // doSendAtCommand("ATE " + (echoEnabled ? "1" : "0"));
        //  doSendAtCommand("AT+CMEE=2"); // extend error logging
        // doSendAtCommand("AT+CMGF=1"); // sms message text mode
        //  doSendAtCommand("AT+CMGD=0,4"); // 删除所有SMS消息
        // setupHandlers();
        // forEuropeanVersionTurnOnlyCatM();
        usbLogger.info(`Init done...`);
    }

    /**
     * 是否有SIM卡,返回
     * at+ccid   //查询ccid，确定是否有sim卡
     * +CCID: 898602A8221478DE0092
     */
    //% block="是否有SIM卡"
    export function HasSims(): boolean {
        var serialRet = serial.writeLine("at+ccid")
        return true
    }
    /**
     * at+creg?  //查询是否注册上网络
        +CREG: 1,5 
     */
    //% block="附着GPRS网络"
    export function IsOnline(): boolean {
        serial.writeLine("at+creg?")
        return true
    }
    /**
     * 返回GSM网络注册状态, 1 或 5表示成功注册
     * 返回结果例子：+CREG: 1,5 
    */
    //% weight=100 blockId="A9G.GsmRegistrationStatus"
    //% group="2. Status: "
    //% block="GSM注册状态"
    export function GsmRegistrationStatus(): number {
        let response = doSendAtCommand("AT+CREG?");
        let registrationStatusCode = -1;
        if (response.includes("+CREG:")) {
            response = response.split(",")[1];
            registrationStatusCode = parseInt(response.split("\r\n")[0])
        }
        return registrationStatusCode
    }
    /**
     * 附着网络
     */
    //% block="附着GPRS网络"
    export function RegGrpsNetwork() {
        serial.writeLine("AT+CGATT=1")  //附着网络，如果需要上网，这条指令是必选的
        serial.writeLine("AT+CGDCONT=1,\"IP\",\"CMNET\"")  // //设置PDP参数
        serial.writeLine("AT+CGACT=1,1")        //激活PDP，正确激活以后就可以上网了
    }
    /**
     * 开启GPS
     */
    //% block="开启GPS"
    export function GpsEnable() {
        serial.writeLine("AT+GPS=1")  // 开启GPS 
        serial.writeLine("AT+GPSRD=1")  // 查询GPS时间间隔为1秒
        serial.writeLine("AT+GPSLP=1") // 设置GPS为低功耗模式
    }
    /**
     * 查询地理位置,返回经度和纬度
     */
    //% block="查询地理位置"
    export function GetLocation() {
        var ret = serial.writeLine("AT+LOCATION=1")
        return ret
    }
    /**
     * 不停读取串口数据，解析GPS信息,直到返回经度和维度
     */
    //% block="解析GPS信息"
    export function ReadGpsInfo() {
        var _timeout = 60;
        do {
            let info = serial.readString()
            if (info.indexOf('V,') != -1 && info.indexOf('V,') < 10 && parseFloat(Latitude) < 10) {
                let location = info.split(',')
                if (parseFloat(location[2]).toString() != 'NaN' && parseFloat(location[2]) > 1) {
                    let index = (parseFloat(location[2]) / 100).toString().indexOf('.')
                    Latitude = (parseFloat(location[2]) / 100).toString().slice(0, index + 5)

                }
            }
            if (info.indexOf('N,') != -1 && info.indexOf('N,') < 10 && parseFloat(Longitude) < 10) {
                let location = info.split(',')
                if (parseFloat(location[2]).toString() != 'NaN' && parseFloat(location[2]) > 1) {
                    let index = (parseFloat(location[2]) / 100).toString().indexOf('.')
                    Longitude = (parseFloat(location[2]) / 100).toString().slice(0, index + 5)

                }
            }
        } while (Latitude == "" || Longitude == "" || parseFloat(Longitude) < 10 || parseFloat(Latitude) < 10)
        return [Latitude, Longitude];
    }
    /**
     * 发送TEXT短信
    
     * @param phone 接收者电话号码 +48333222111 "+(country code)(9-digit phone number)"
     * @param stext 短信内容
     */
    //% block="发送TEXT短信(只支持英文)"
    export function SendTextSms(phone: string, stext: string) {
        doSendAtCommand("AT+CMGF=1"); // set text mode
        doSendAtCommand('AT+CMGS="' + phone + '"');
        doSendAtCommand(stext + "\x1A");
        usbLogger.info(`Sent SMS message`)
    }
    /**
     * 处理短信的回调
     * @param handler 
     */
    //% weight=100 blockId="A9G.OnSmsReceived"
    //% group="3. GSM: "
    //% block="on SMS received from $senderNumber with $message"
    //% draggableParameters
    export function OnSmsReceived(handler: (senderNumber: string, message: string) => void) {
        smsReceivedHandler = handler
    }

    /**
     * 获取当前日期时间；格式为 "yy/MM/dd,hh:mm:ss±zz"
     */
    //% weight=100 blockId="A9G.DateAndTime"
    //% group="3. GSM: "
    //% block="date and time"
    export function DateAndTime(): string {
        doSendAtCommand("AT+CLTS=1"); // enable in case it's not enabled
        let modemResponse = doSendAtCommand('AT+CCLK?');
        if (modemResponse.includes('+CCLK:')) {
            return modemResponse.split('"')[1]
        }
        return null
    }
    /**
     * 发送PDU短信(支持中文)
     * @param phone 接收者电话号码
     * @param stext 短信内容
     */
    //% block="发送PDU短信(支持中文)"
    export function SendPduSms(phone: string, stext: string) {

    }
    /**
     * 发送短信
     * @param phone 接收者电话号码
     * @param stext 短信内容
     */
    //% block="发送短信"
    export function SendSMS(phone: string, stext: string) {
        let ntext = ""
        let resultStr = ""
        let content = ""
        let buffer = pins.createBuffer(1);
        buffer.setNumber(NumberFormat.Int8LE, 0, 0x1A)
        phone = "" + phone + "F"
        ntext = ""
        resultStr = ""
        for (let i = 0; i <= phone.length - 1; i += 2) {
            let nameArr = phone.substr(i, 2).split('')
            helpers.arrayReverse(nameArr)
            resultStr += nameArr[0] + nameArr[1]
        }
        for (let j = 0; j <= stext.length - 1; j++) {
            ntext = ntext + "00" + inttohex(stext.charCodeAt(j))
        }
        ntext = "8B66544AFF0168C06D4B52306E295EA68FC79AD8FF014F4D7F6EFF1A000A" + ntext
        content = "0011000D9168" + resultStr + "0008B0" + inttohex(parseInt((ntext.length / 2).toString())) + ntext
        serial.writeLine("AT+CMGS=" + (parseInt((content.length / 2).toString()) - 1).toString())
        serial.writeString(content)
        serial.writeBuffer(buffer)
    }
    //--------------------------------------------------------------------------
    /**
     * 初始化MQTT
     * @param apnName 
     */
    //% weight=100 blockId="cloudConnector.initMqtt"
    //% group="4. MQTT:"
    //% block="init MQTT with APN name: %apnName"
    export function InitMqtt(apnName: string) {
        actualApnName = apnName;
        EnsureGsmConnection();
        EnsureGprsConnection()
    }
    /**
     * 连接MQTT服务器
     * @param broker MQTT服务器地址
     * @param topic  主题
     */
    //% block="连接MQTT服务器"
    export function ConectMqtt(broker: string, port: number,clientId:string,userName:string,password:string) {
        
        SendAtCommandCheckAck(`AT+MQTTCONN="${broker}",${port},"${clientId}",120,0,"${userName}","${password}"`)

    }

    /**
     * 发布消息
     * @param topic 消息主题
     * @param message 
     * @param qos 
     * @param retain 
     */
    //% weight=100 blockId="A9G.publishOnMqtt"
    //% group="4. MQTT:"
    //% block="publish on MQTT topic:%topic message:%message||qos:%qos retain:%retain"
    //% qos.defl=1 retain.defl=0 expandableArgumentMode="toggle"
    export function PublishOnMqtt(topic: string, message: string, qos = 1, retain = 0) :boolean{
      
        let cmd=`AT+MQTTPUB=${topic},${message},${qos},0,${retain}`
        let modemResponse= doSendAtCommand(cmd, 100, true, true);
        basic.pause(100);
        if (modemResponse.includes("ERROR")) { 
            return false
        }
        /*
        let modemResponse = doSendAtCommand(message, 3000, false, true, 1000);

        let tries = 0;
        while ((modemResponse.includes("ERROR") || modemResponse.includes("SMSTATE: 0")) && (!(tries > 6))) {
            usbLogger.info(`MQTT publish failed, retrying... attepmt: ${tries}`);
            let modemNetState = doSendAtCommand("AT+CNACT?", -1);
            let mqttConnectionState = doSendAtCommand("AT+SMSTATE?", -1);
            if (modemNetState.includes("+CNACT: 0")) {
                //network seem disconnected, try to reinit
                InitMqtt(actualApnName);
                SendAtCommandCheckAck("AT+SMCONN")
            }
            if (mqttConnectionState.includes("+SMSTATE: 0")) {
                //seem like mqtt disconnection,try to reconnect
                doSendAtCommand("AT+SMDISC");
                SendAtCommandCheckAck("AT+SMCONN")
            }
            //retry message publishing
            doSendAtCommand(cmd, 100);
            modemResponse = doSendAtCommand(message, 5000, false, true);

            tries++
        }*/
        usbLogger.info(`MQTT message on topic: "${topic}" published`)
        return true
    }

    /**
     * MQTT订阅(AT第二个参数为0表示取消订阅；第三个参数表示)
     */
    //% weight=100 blockId="A9G.SubscribeToMqtt"
    //% group="4. MQTT:"
    //% block="订阅MQT主题:%topic"
    export function SubscribeToMqtt(topic: string,qos:number=0) {
        let cmd = `AT+MQTTSUB="${topic}",1,${qos}`
        doSendAtCommand(cmd, 100, true, true);
        mqttSubscribeTopics.push(topic)
    }


    /**
     * MQTT on subscription receive
     */
    //% weight=100 blockId="cloudConnector.onMqttMessageReceived"
    //% group="4. MQTT:"
    //% block="on MQTT $topic subscribtion with $message received"
    //% draggableParameters
    export function OnMqttMessageReceived(handler: (topic: string, message: string) => void) {
        mqttSubscribeHandler = handler
    }


    /**
     * MQTT Live Objects publish message
     */
    //% weight=100 blockId="A9G.PublishOnLiveObjects"
    //% group="4. MQTT:"
    //% block="publish data:%data with timestamp:%timestamp into Live Objects stream:%stream"
    export function PublishIntoLiveObjects(data: string[], timestamp: string, stream: string) {
        let dataString = '';
        for (let i = 0; i < data.length; i++) {
            dataString += ',"' + i + '":"' + data[i] + '"'
        }

        let liveObjectMsg = '{ "s":"' + stream + '", "v": { "timestamp":"' + timestamp + '"' + dataString + '} }';
        PublishOnMqtt("dev/data", liveObjectMsg)
    }

    /**
     * 默认接收短信处理
     * @param fromNumber 
     * @param message 
     */
    let smsReceivedHandler = function (fromNumber: string, message: string) {
        usbLogger.warn(`Got SMS form ${fromNumber} but SMS received handler is not implemented!`
            + `Skipping message ${message}`);
    };
    /**
     * 默认MQTT订阅消息处理
     * @param topic 
     * @param message 
     */
    let mqttSubscribeHandler = function (topic: string, message: string) {
        usbLogger.warn(`Subscribed for MQTT topic "${topic}" but MQTT subscribe handler is not implemented! `
            + `Skipping message ${message}`);
    };

    //----------------------------------------------------------------
    /**
     * 初始化HTTP
     * @param apnName 
     */
    //% weight=100 blockId="A9G.initHttp"
    //% group="5. HTTP:"
    //% block="init HTTP with APN name:%apnName"
    export function InitHttp(apnName: string) {
        actualApnName = apnName;
        SendAtCommandCheckAck('AT+SAPBR=3,1,"APN","' + actualApnName + '"');
        SendAtCommandCheckAck('AT+SAPBR=1,1');
        SendAtCommandCheckAck('AT+SAPBR=2,1');
        if (!SendAtCommandCheckAck('AT+HTTPINIT')) {
            SendAtCommandCheckAck('AT+HTTPTERM');
            SendAtCommandCheckAck('AT+HTTPINIT')
        }
    }

    /**
     * HTTP POST请求
     * @param data POST请求数据
     * @param url 请求地址
     */
    //% weight=100 blockId="A9G.httpPost"
    //% group="5. HTTP:"
    //% block="post data:%data through HTTP to url:%url"
    export function httpPost(data: string, url: string) {
        SendAtCommandCheckAck('AT+HTTPPARA="URL","' + url + '"');
        doSendAtCommand("AT+HTTPDATA=" + data.length + ",1000");
        basic.pause(100);
        doSendAtCommand(data, 1000, false);
        SendAtCommandCheckAck('AT+HTTPACTION=1')
    }

    /**
  * GPS init
  */
    //% weight=100 blockId="A9G.gpsInit"
    //% group="6. GPS:"
    //% block="init GPS"
    export function GpsInit() {
        SendAtCommandCheckAck("AT+CGNSPWR=1")
    }

    /**
     * 获取GPS定位
     */
    //% weight=100 blockId="A9G.getPosition"
    //% group="6. GPS:"
    //% block="获取GPS位置"
    export function GpsPosition(): string {
        let modemResponse = doSendAtCommand("AT+CGNSINF");
        let position = "";
        while (!modemResponse.includes("+CGNSINF: 1,1")) {
            basic.pause(1000);
            modemResponse = doSendAtCommand("AT+CGNSINF")
        }
        let tmp = modemResponse.split(",");
        position = tmp[3] + "," + tmp[4];
        return position
    }

}
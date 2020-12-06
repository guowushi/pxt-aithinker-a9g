/**
 * MakeCode editor extension for AiThinker A9G  by guowushi@qq.com
 */
//% block="A9G" weight=100 color=#ff8f3f icon="\uf043"
namespace A9G {

    
    let actualApnName = "internet";
    let echoEnabled = false; //should be alsways on false during normal operation
    let mqttSubscribeTopics: string[] = []; //订阅的主题
    let httpsConnected = false; //HTTP连接成功标志
    let requestFailed = false; //请求失败标志
    //定义经度和维度
    let Latitude = ""
    let Longitude = ""


    
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
     * 发送AT命令 (internal function)
     * @param atCommand AT命令字符串
     * @param timeout   超时时间
     * @param useNewLine 是否新行
     * @param forceLogDisable  
     * @param additionalWaitTime 额外等待时间
     */
     //% group="1. Setup: "
    //% block="Send AT CMD", AT: $atCommand timeout: $timeout"
    export function doSendAtCommand(atCommand: string, timeout = 1000, useNewLine = true, forceLogDisable = false, additionalWaitTime = 0): string {
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
     //% group="1. Setup: "
    //% block="AT CMD and Check",AT: $atCommand retry times: $limit"
    export function SendAtCommandCheckAck(atCommand: string, limit = 5): boolean {
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
    //% group="1. Setup: "
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
           //  usbLogger.info(`Trying to comunicate with modem...`)
         }
    }

    

    /**
     * 是否有SIM卡,返回
     * at+ccid   //查询ccid，确定是否有sim卡
     * +CCID: 898602A8221478DE0092
     */
    //% group="1. Setup: "
    //% block="是否有SIM卡"
    export function HasSims(): boolean {
        let cmd ="at+ccid"
        let atResponse = doSendAtCommand(cmd, 1000);
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
    //% group="6. GPS:"
    //% block="附着GPRS网络"
    export function RegGrpsNetwork() {
        doSendAtCommand("AT+CGATT=1")  //附着网络，如果需要上网，这条指令是必选的
        doSendAtCommand("AT+CGDCONT=1,\"IP\",\"CMNET\"")  // //设置PDP参数
        doSendAtCommand("AT+CGACT=1,1")        //激活PDP，正确激活以后就可以上网了
    }
    /**
     * 开启GPS
     */
     //% group="6. GPS: "
    //% block="开启GPS"
    export function GpsEnable() {
        doSendAtCommand("AT+GPS=1")  // 开启GPS 
        doSendAtCommand("AT+GPSRD=1")  // 查询GPS时间间隔为1秒
        doSendAtCommand("AT+GPSLP=1") // 设置GPS为低功耗模式
        doSendAtCommand("AT+GPSMD=2")  // 设置为GPS+BD 模式
      //  usbLogger.info(`Gps Enabled...`)
    }
    /**
     * 查询地理位置,返回经度和纬度
     *  @param mode 1：基站地址  2：GPS 地址
     */
     //% group="6. GPS: "
    //% block="查询地理位置"
    export function GetLocation(mode:number) {
        let cmd = "AT+LOCATION=" + mode
        let atResponse = doSendAtCommand(cmd)
       // usbLogger.info(atResponse)
        return atResponse
    }
   
    /**
     * 发送TEXT短信
    
     * @param phone 接收者电话号码 +48333222111 "+(country code)(9-digit phone number)"
     * @param stext 短信内容
     */
     //% group="3. GSM: "
    //% block="发送TEXT短信(只支持英文)"
    export function SendTextSms(phone: string, stext: string) {
        doSendAtCommand("AT+CMGF=1"); // set text mode
        doSendAtCommand('AT+CMGS="' + phone + '"');
        doSendAtCommand(stext + "\x1A");
        usbLogger.info(`Sent SMS message`)
    }
   
    /**
     * 发送短信
     * @param phone 接收者电话号码
     * @param stext 短信内容
     */
    //% group="3. GSM: "
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
     
   

}
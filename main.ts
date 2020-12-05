/**
 * MakeCode editor extension for AiThinker A9G
 * by guowushi@qq.com
 */
//% block="A9G" weight=100 color=#ff8f3f icon="\uf043"
namespace A9G {


    let ntext = "" 
    let resultStr = "" 
    //定义经度和维度
    let Latitude = "" 
    let Longitude = "" 
    let bool = 0 
    let content = "" 

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
     * 初始化A9G模块
     * @param tx 模块串口TX端对应的引脚 ,如 SerialPin.P2
     * @param rx 模块串口RX端对应的引脚 ，如SerialPin.P1
     */
    //% block="初始化A9G模块"
    export function InitA9G( tx: SerialPin, rx :SerialPin) { 
        serial.redirect( 
            tx, 
            rx, 
            BaudRate.BaudRate115200 
        ) 
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
     * 读取GPS信息,直到返回经度和维度
     */
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
       return [Latitude,Longitude];
    }

    /**
     * 发送短信
     * @param phone 接收者电话号码
     * @param stext 短信内容
     */
    //% block="发送短信"
    export  function SendSMS(phone: string, stext: string) {
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
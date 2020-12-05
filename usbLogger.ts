/**
 * Usb logger Microbit block
 */
//% color=#202020 icon="\uf15c" block="Usb logger" advanced=true
namespace usbLogger {
  /**
   * 日志级别
   */
  export enum LoggingLevel {
    TRACE = 0,  
    DEBUG = 100,
    INFO = 200,
    WARN = 300,
    ERROR = 400,
  }

  /**
   * 将枚举转成字符串
   * @param loggingLevel 日志等级枚举
   */
  function loggingLevelLabel(loggingLevel: LoggingLevel) {
    switch (loggingLevel) {
      case LoggingLevel.TRACE:
        return "TRACE";
        break;
      case LoggingLevel.DEBUG:
        return "DEBUG";
        break;
      case LoggingLevel.INFO:
        return "INFO";
        break;
      case LoggingLevel.WARN:
        return "WARN";
        break;
      case LoggingLevel.ERROR:
        return "ERROR";
        break;
    }
  }

  // TODO https://stackoverflow.com/a/61062698
  // const LoggingLevelLabel: { [key in LoggingLevel]: string } = {
  //   [LoggingLevel.TRACE]: "TRACE",
  //   [LoggingLevel.DEBUG]: "DEBUG",
  //   [LoggingLevel.INFO]: "INFO",
  //   [LoggingLevel.WARN]: "WARN",
  //   [LoggingLevel.ERROR]: "ERROR",
  // };

  let usbLoggingLevel = LoggingLevel.INFO;  //默认等级为INFO
  let appTxPin = SerialPin.P0; //默认TX引脚为P0
  let appRxPin = SerialPin.P1; //默认RX引脚为P1
  let appBaudRate = BaudRate.BaudRate115200; //默认波特率
  export let initialised = false;   // USB日志是否初始标志


    /**
     * 初始化日志模块
     * @param txPin  TX引脚
     * @param rxPin  RX引脚
     * @param baudRate 波特率
     * @param loggingLevel  日志级别
     */
  //% weight=100 blockId="usbLogger.init"
  //% group="1. Setup: "
  //% block="Usb logger Init TX: %txPin RX: %rxPin Baud: %baudRate Logging level: %loggingLevel"
  //% txPin.defl=SerialPin.P0 rxPin.defl=SerialPin.P1 baudRate.defl=BaudRate.BaudRate115200
  export function init(txPin: SerialPin, rxPin: SerialPin, baudRate: BaudRate, loggingLevel?: LoggingLevel) {
    if (initialised) {
      warn(`Logger is already initialised. Overriding`)
    }
    appTxPin = txPin;
    appRxPin = rxPin;
    appBaudRate = baudRate;
    usbLoggingLevel = loggingLevel;

    serial.redirect(appTxPin, appRxPin, appBaudRate);
    serial.setWriteLinePadding(0);
    serial.setRxBufferSize(128)

    initialised = true;
  }

  /**
   * 将日志通过usb串口连接输出
   */
  //% weight=100 blockId="usbLogger.log"
  //% group="2. Logging messages:"
  //% block="Log message: %message with level: %level"
  export function log(message: string, messageLevel: LoggingLevel) {
    if (messageLevel != null && messageLevel < usbLoggingLevel) {
      return
    }

    basic.pause(10);
    serial.redirectToUSB();
    serial.writeLine(`${input.runningTime()}\t${loggingLevelLabel(messageLevel)}\t: ${message}`);
    basic.pause(10);
    serial.redirect(appTxPin, appRxPin, appBaudRate)
  }

  export function trace(message: string) {
    log(message, LoggingLevel.TRACE);
  }

  export function debug(message: string) {
    log(message, LoggingLevel.DEBUG);
  }

  export function info(message: string) {
    log(message, LoggingLevel.INFO);
  }

  export function warn(message: string) {
    log(message, LoggingLevel.WARN);
  }

  export function error(message: string) {
    log(message, LoggingLevel.ERROR);
  }

}
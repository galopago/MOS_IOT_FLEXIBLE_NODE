load('api_timer.js');
load('api_mqtt.js');
load('api_i2c.js');
load('api_gpio.js');
load('api_esp32.js');
load('api_rpc.js');
load('api_sys.js');

let topic_ul = '/mosiotnode/uplink';
let topic_dl = '/mosiotnode/downlink';

let LM75A_I2C_ADDR=0x48;
let	GPIOLED =2;
let MIN_TO_SLEEP = 2;
let NO_NET_TIMEOUT_SEG = 120;
let DEVICE_ARCH;
let DEVICE_ID;


// *** LM75A onboard debug LED setup //
GPIO.set_pull(GPIOLED,GPIO.PULL_NONE);
GPIO.set_mode(GPIOLED,GPIO.MODE_OUTPUT);
GPIO.write(GPIOLED,1);

// *** LM75A sensor setup //
// Address 1001+A2A1A0
// 0x48
let LM75A=I2C.get();

let message_ul={"id":"","temp":0.0};

// read self device info
RPC.call(RPC.LOCAL, 'Sys.GetInfo', null, function(resp, ud) {
  DEVICE_ID = resp.id;
  DEVICE_ARCH = resp.arch;

},null);


// ************************************************
// Get Temperature
// ************************************************
function getTempC(){
	let temperature=I2C.readRegW(LM75A,LM75A_I2C_ADDR,0x00);
	let temperatureC;
	if(temperature < 32768)
	{
		temperatureC = (temperature/256);
	}
	else
	{
		temperatureC =( (temperature - 65535)-1)/256;
	}
	//Converting to string and rounding decimals
	let strtempc = JSON.stringify(temperatureC);
	let indexofdot = strtempc.indexOf('.');
	let sizeofstr = strtempc.length;
	let numofdecimals;
	if(indexofdot < 0)
	{
		// integer number with no decimals, so must add them
		strtempc = strtempc+'.00'
		numofdecimals=0;
	}
	else
	{
		// Count the number of decimals for adding or clipping
		numofdecimals = sizeofstr-(indexofdot+1);								
	}
	
	print("Text temp:",strtempc);
	print("Size of string:"strtempc.length)
	print("Index of dot:",indexofdot);
	print("decimals:",numofdecimals);
	return temperatureC;

}

// ************************************************
// Build MQTT uplink message
// ************************************************

function buildMsgUl(){

	message_ul.id=DEVICE_ID;
	message_ul.temp=getTempC();

}
// ************************************************
// No network connection timeout
// ************************************************
Timer.set(NO_NET_TIMEOUT_SEG*1000, 0, function() {	
	print('Going to sleep, no network conn after:',NO_NET_TIMEOUT_SEG);
	ESP32.deepSleep(MIN_TO_SLEEP * 60 * 1000 * 1000);
}, null);


// ************************************************
// listen to MQTT server topic for dowlink data
// ************************************************

MQTT.sub(topic_dl,function(conn,topic,msg){
	print('Topic:', topic, 'message:', msg);	
},null);



// ************************************************
// read temperature each 10 segs
// ************************************************

Timer.set(10000, Timer.REPEAT, function() {
		
	buildMsgUl();
	print('msg',JSON.stringify(message_ul));
}, null);


// ************************************************
// MQTT connection is ok (WiFi also!)
// ************************************************

MQTT.setEventHandler(function(conn,ev,data){

	if(ev === MQTT.EV_CONNACK)
	{
		print('got MQTT.EV_CONNACK');
		if (DEVICE_ARCH === 'esp32')
			{
				buildMsgUl();
				let okul = MQTT.pub(topic_ul, JSON.stringify(message_ul), 1);
  				print('Published:', okul, topic_ul, '->', message_ul);
  				// Wait for some time for downlink data before sleeping	  				
  				Timer.set(5000, false, function (){
  					print('Going to sleep for mins',MIN_TO_SLEEP);
  					ESP32.deepSleep(MIN_TO_SLEEP * 60 * 1000 * 1000);     
  				}, null);	       										
			}
	}

},null);

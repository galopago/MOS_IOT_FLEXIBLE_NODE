load('api_timer.js');
load('api_mqtt.js');
load('api_gpio.js');
load('api_esp32.js');
load('api_rpc.js');
load('api_sys.js');
load('api_adc.js');
load('api_net.js');
load('api_arduino_onewire.js');
load('ds18b20.js');

let	GPIOLED = 				2;
let	GPIOADC = 				34;
let GPIODS18B20 = 			26;
let ADCR1 = 				68;		// ADC voltage divider 'upper' resistor
let ADCR2 = 				20;		// ADC voltage divider 'lower' resistor
let ADCRES = 				4095;
let ADCALFAC = 				1.337;	// Qick and dirty calibration factor
let MIN_TO_SLEEP = 			2;
let NO_NET_TIMEOUT_SEG = 	120;

let DEVICE_ARCH;
let DEVICE_ID;

let topic_ul =				'/mosiotnode/uplink';
let topic_dl =				'/mosiotnode/downlink';
let apphost =				'galopago-iotnode.herokuapp.com';
let appport =				'80';

let message_ul=				{"sensor_id":"","temperature_ext":0.0,"temperature_int":0.0,"battery":0.0};
let message_header =		'POST /dbpost HTTP/1.1'+chr(13)+chr(10); 
let message_host =			'Host: '+apphost+chr(13)+chr(10); 
let message_conn =			'Connection: close'+chr(13)+chr(10); 
let message_type =			'Content-Type: application/json'+chr(13)+chr(10);
let message_length =		'Content-Length: ';

// *** onboard debug LED setup //
GPIO.set_pull(GPIOLED,GPIO.PULL_NONE);
GPIO.set_mode(GPIOLED,GPIO.MODE_OUTPUT);
GPIO.write(GPIOLED,1);

// *** ADC for battery voltage //
ADC.enable(GPIOADC);

// Initialize OneWire library
let ow = OneWire.create(GPIODS18B20);
// Number of sensors found on the 1-Wire bus
let owsensors = 0;
// Sensors addresses
let rom = ['01234567'];
// not found TEMP value
let DS18B20NF = 99.99;

// Search for ow sensors
let owSearchSens = function() {
  let i = 0;
  // Setup the search to find the device type on the next call
  // to search() if it is present.
  ow.target_search(DEVICE_FAMILY.DS18B20);

  while (ow.search(rom[i], 0/* Normal search mode */) === 1) {
    // If no devices of the desired family are currently on the bus, 
    // then another type will be found. We should check it.
    if (rom[i][0].charCodeAt(0) !== DEVICE_FAMILY.DS18B20) {
      break;
    }
    // Sensor found
    print('Sensor#', i, 'address:', toHexStr(rom[i]));
    rom[++i] = '01234567';
  }
  return i;
};

// read self device info
RPC.call(RPC.LOCAL, 'Sys.GetInfo', null, function(resp, ud) {
  DEVICE_ID = resp.id;
  DEVICE_ARCH = resp.arch;

},null);

// ************************************************
// Round to x number of decimals return string
// ************************************************
function roundNdigitsTostr(number,digits){

	let strtempc = JSON.stringify(number);
	let indexofdot = strtempc.indexOf('.');
	let sizeofstr = strtempc.length;
	let actualdecimals;
	
	if(indexofdot < 0)
	{
		// integer number with no decimals, so must add them
		strtempc = strtempc+'.'
		indexofdot = strtempc.indexOf('.');
		sizeofstr = strtempc.length;
	}
	
	// Count the number of decimals for adding or clipping
	actualdecimals = sizeofstr-(indexofdot+1);									
		
	if ( digits < 1 || digits === actualdecimals)
	{
		// do noting for 0 digits (use Math.round instead! ),negatives or same digits
		return number;
	}
	
	// digits need to be added
	if(actualdecimals < digits)
	{
		let zeros = digits - actualdecimals;
		for( let i=0; i<zeros; i++ )
			{
				strtempc = strtempc+'0'
			}
	}
	
	// digits need to be clipped
	if(actualdecimals > digits)
	{
		strtempc=strtempc.slice(0,indexofdot+digits+1);				
	}
	
	return strtempc	;
	//print("Number in text rounded:",strtempc);
	//print("Digits to round:",digits);
	//print("Actualdecimals",actualdecimals);
}
// **************************************************
// Get Battery with voltage divider  +ADCR1/ADCR2-
// **************************************************
function getBatV(){

	let rawadc = ADC.read(GPIOADC);	
	let vdivfac = (ADCR1+ADCR2)/ADCR2;
	print('rawadc:',rawadc);
	print('vdivfac:',vdivfac);
	print('ADCRES:',ADCRES);
	//let batV = (rawadc*3.3*vdivfac)/ADCRES;	
	let batV = (rawadc*3.3*vdivfac*ADCALFAC)/ADCRES;	
	//let batV = rawadc;	
	return batV;
}

// ************************************************
// Get Temperature
// ************************************************
function getTempC(){
	if (owsensors === 0)
	{
    	if ((owsensors = owSearchSens()) === 0)
    		{
      			print('No device found');      			
      			return DS18B20NF;      		
    		}
  	}
	
	for (let i = 0; i < owsensors; i++) 
	{
    	let t = getTemp(ow, rom[i]);
    	if (isNaN(t)) 
    	{
      		print('No device found');
      		return DS18B20NF;      		
    	} 
    	else 
    	{
      		print('Sensor#', i, 'Temperature:', t, '*C');
      		return t;
    	}
	}	

}

// ************************************************
// Build MQTT uplink message
// ************************************************

function buildMsgUl(){

	message_ul.sensor_id=DEVICE_ID;	
	let extTemperatureCstr = roundNdigitsTostr(getTempC(),2);
	message_ul.temperature_ext=extTemperatureCstr;
	let intTemperatureCstr = roundNdigitsTostr((5/9)*(ESP32.temp()-32),2);
	message_ul.temperature_int=intTemperatureCstr;	
	let batVstr = getBatV();
	message_ul.battery=roundNdigitsTostr(batVstr,2);
		
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
		Net.connect({
   // Required. Port to listen on, 'tcp://PORT' or `udp://PORT`.
   addr: apphost+':'+appport,
   // Optional. Called when connection is established.
   onconnect: function(conn) {
   		print('onconnect:');
   		buildMsgUl();
   		let tstr=JSON.stringify(message_ul);
		let siz=tstr.length;
		print("tstr:",tstr);
   		Net.send(conn, message_header); 
 		Net.send(conn, message_host); 
 		Net.send(conn, message_conn); 
 		Net.send(conn, message_type); 
 		Net.send(conn, message_length); 		
   		Net.send(conn, JSON.stringify(siz)+chr(13)+chr(10)); 
   		Net.send(conn, chr(13)+chr(10)); 
   		Net.send(conn, tstr+chr(13)+chr(10)); 
   	}, 
   // Optional. Called when new data is arrived.
   ondata: function(conn, data) {
   		print('Received from:', Net.ctos(conn, false, true, true), ':', data);    	
    	Net.discard(conn, data.length);  // Discard received data   		
   	},
   // Optional. Called when protocol-specific event is triggered.
   onevent: function(conn, data, ev, edata) {},
   // Optional. Called when the connection is about to close.
   onclose: function(conn) {print('onclose:')},
   // Optional. Called when on connection error.
   onerror: function(conn) {print('onerror:')},
});

		print('got MQTT.EV_CONNACK');
		if (DEVICE_ARCH === 'esp32')
			{
				buildMsgUl();
				// Publish thru MQTT
				let okul = MQTT.pub(topic_ul, JSON.stringify(message_ul), 1);
  				print('Published:', okul, topic_ul, '->', message_ul);  			
  				// Wait for some time for downlink data before sleeping	  				
  				Timer.set(7000, false, function (){
  					print('Going to sleep for mins',MIN_TO_SLEEP);
  					ESP32.deepSleep(MIN_TO_SLEEP * 60 * 1000 * 1000);     
  				}, null);	       										
			}
	}

},null);

// ************************************************
// HTTP Net?
// ************************************************


//client.println("POST /dbpost HTTP/1.1");
//  client.println(String("Host: ") + server); 
//  client.println("Connection: close\r\nContent-Type: application/json");
//  client.print("Content-Length: ");
//  client.println(jsonObject.length());
//  client.println();
//  client.println(jsonObject);

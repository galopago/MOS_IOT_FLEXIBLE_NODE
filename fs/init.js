load('api_timer.js');
load('api_config.js');
load('api_mqtt.js');
load('api_gpio.js');
load('api_esp32.js');
load('api_rpc.js');
load('api_sys.js');
load('api_adc.js');
load('api_net.js');
load('api_file.js');
load('api_arduino_onewire.js');
load('ds18b20.js');

// Default hard coded values settings

let	GPIOBOARDLED =					2;
let	GPIOADC = 						34;
let GPIODS18B20 = 					26;
let ADCR1 = 						68;		// ADC voltage divider 'upper' resistor
let ADCR2 = 						20;		// ADC voltage divider 'lower' resistor
let ADCRES = 						4095;
let ADCALFAC = 						1.337;	// Qick and dirty calibration factor
let MINS_TO_SLEEP =					2;
let NO_NET_TIMEOUT_SEG = 			120;
let DOWNLINK_WINDOW_TIMER_SEG = 	7;
let ENABLED_ONBOARD_DEBUG_LED = 	1;
let COUNTS_FOR_TX =					5;

let DEVICE_ARCH;
let DEVICE_ID;
let WIFI_TX_FLAG;
let TESTMODE;
let DSTORE;

// read self device info
DEVICE_ID=Cfg.get('device.id');
TESTMODE=Cfg.get('testmode.enable');

let topic_ul =				'/mosiotnode/uplink';
let topic_conf_ul =			'/mosiotnode/sendconf';
let topic_dl =				'/mosiotnode/'+DEVICE_ID+'/downlink';
let apphost =				'galopago-iotnode.herokuapp.com';
let appport =				'80';

let message_ul=				{"sensor_id":"","temperature_ext":0.0,"temperature_int":0.0,"battery":0.0,"timestamp":""};
let message_header =		'POST /dbpost HTTP/1.1'+chr(13)+chr(10); 
let message_host =			'Host: '+apphost+chr(13)+chr(10); 
let message_conn =			'Connection: close'+chr(13)+chr(10); 
let message_type =			'Content-Type: application/json'+chr(13)+chr(10);
let message_length =		'Content-Length: ';

// Reading config values from file, if a key not found, harcoded value used instead
let settings = JSON.parse(File.read('settings.json'));

if(settings.gpioboardled !== null)
{ GPIOBOARDLED=settings.gpioboardled;}
if(settings.minstosleep !== null)
{ MINS_TO_SLEEP=settings.minstosleep;}
if(settings.enabledled !== null)
{ ENABLED_ONBOARD_DEBUG_LED=settings.enabledled;}
if(settings.gpioadc !== null)
{ GPIOADC=settings.gpioadc;}
if(settings.gpiods18b20 !== null)
{ GPIODS18B20=settings.gpiods18b20;}
if(settings.adcr1 !== null)
{ ADCR1=settings.adcr1;}
if(settings.adcr2 !== null)
{ ADCR2=settings.adcr2;}
if(settings.adcalfac !== null)
{ADCALFAC=settings.adcalfac;}
if(settings.minstosleep !== null)
{MINS_TO_SLEEP=settings.minstosleep;}
if(settings.segsnonetimeout !== null)
{NO_NET_TIMEOUT_SEG=settings.segsnonetimeout;}
if(settings.segsdownlinktime !== null)
{DOWNLINK_WINDOW_TIMER_SEG=settings.segsdownlinktime;}
if(settings.countsfortx !== null)
{COUNTS_FOR_TX=settings.countsfortx;}

print('Actual setup values:');
print('---------------------------');
print('DEVICE_ID:                 ',DEVICE_ID);
print('GPIOBOARDLED:              ',GPIOBOARDLED);
print('ENABLED_ONBOARD_DEBUG_LED: ',ENABLED_ONBOARD_DEBUG_LED);
print('GPIOADC:                   ',GPIOADC);	
print('GPIODS18B20:               ',GPIODS18B20);
print('ADCR1:                     ',ADCR1);
print('ADCR2:                     ',ADCR2);
print('MINS_TO_SLEEP:             ',MINS_TO_SLEEP);
print('NO_NET_TIMEOUT_SEG:        ',NO_NET_TIMEOUT_SEG);
print('DOWNLINK_WINDOW_TIMER_SEG: ',DOWNLINK_WINDOW_TIMER_SEG);
print('COUNTS_FOR_TX              ',COUNTS_FOR_TX);
print('---------------------------');

// Reading samples count from file to determine if a WiFi transmission is needed
let samplescount = JSON.parse(File.read('samplescount.json'));

print("samplescount.counter:",samplescount.counter);
if(samplescount.counter === COUNTS_FOR_TX-1)
{WIFI_TX_FLAG=1;}
else
{WIFI_TX_FLAG=0;}
print('WIFI_TX_FLAG:',WIFI_TX_FLAG);
print('TESTMODE:',TESTMODE);
	
// *** onboard debug LED setup //
GPIO.set_pull(GPIOBOARDLED,GPIO.PULL_NONE);
GPIO.set_mode(GPIOBOARDLED,GPIO.MODE_OUTPUT);

// If enabled stay ON while processor is awake
if ( ENABLED_ONBOARD_DEBUG_LED !== 0)
{GPIO.write(GPIOBOARDLED,1);}

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
			{strtempc = strtempc+'0'}
	}
	
	// digits need to be clipped
	if(actualdecimals > digits)
	{strtempc=strtempc.slice(0,indexofdot+digits+1);}
	
	return strtempc	;

}
// **************************************************
// Get Battery with voltage divider  +ADCR1/ADCR2-
// **************************************************
function getBatV(){

	let rawadc = ADC.read(GPIOADC);	
	let vdivfac = (ADCR1+ADCR2)/ADCR2;
	let batV = (rawadc*3.3*vdivfac*ADCALFAC)/ADCRES;	

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
      			print('No ow device found');      			
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
	let timeunix = Timer.now();
	let timestamp = Timer.fmt('%Y-%m-%d %H:%M:%S',timeunix);	
	message_ul.timestamp = timestamp;
}
// ************************************************
// No network connection timeout
// ************************************************
Timer.set(NO_NET_TIMEOUT_SEG*1000, 0, function() {	
	print('Going to sleep, no network conn after:',NO_NET_TIMEOUT_SEG);
	// reset counter and disable wifi
	samplescount.counter = 0;
	File.write(JSON.stringify(samplescount),'samplescount.json');	
	Cfg.set({wifi:{sta:{enable:false}}});
	Cfg.set({wifi:{ap:{enable:false}}});
		
	ESP32.deepSleep(MINS_TO_SLEEP * 60 * 1000 * 1000);
}, null);


// ************************************************
// STORE/TRANSMIT LOGIC
//
// ************************************************
if(WIFI_TX_FLAG === 0 && TESTMODE === false )
{
	print('Sampling and storing data');
	buildMsgUl();
	
	DSTORE = File.read('datastore.ndjson');
	DSTORE = DSTORE+JSON.stringify(message_ul)+chr(13)+chr(10);
	print('DSTORE:',DSTORE);
	File.write(DSTORE,'datastore.ndjson');	
					
	// saving increased counter
	samplescount.counter = samplescount.counter+1;
	File.write(JSON.stringify(samplescount),'samplescount.json');	
	// Enable wifi on next reboot?
	if(samplescount.counter === COUNTS_FOR_TX-1)
	{
		Cfg.set({wifi:{sta:{enable:true}}});
		Cfg.set({wifi:{ap:{enable:false}}});
	}

	print('Going to sleep for ',MINS_TO_SLEEP,' mins');
  	ESP32.deepSleep(MINS_TO_SLEEP * 60 * 1000 * 1000);
	
}


// ************************************************
// MQTT connection is ok (WiFi also!)
// ************************************************

MQTT.setEventHandler(function(conn,ev,data){

	if(ev === MQTT.EV_CONNACK && WIFI_TX_FLAG === 1)
	{
		print('got MQTT.EV_CONNACK');
		buildMsgUl();
		
		DSTORE = File.read('datastore.ndjson');
		DSTORE = DSTORE+JSON.stringify(message_ul)+chr(13)+chr(10);
		print('DSTORE:',DSTORE);
		File.write(DSTORE,'datastore.ndjson');	

		// Sending data thru HTTP POST
		Net.connect({
   			// Required. Port to listen on, 'tcp://PORT' or `udp://PORT`.
   			addr: apphost+':'+appport,
   			// Optional. Called when connection is established.
   			onconnect: function(conn) {
   				print('onconnect:');   				
   				//let tstr=JSON.stringify(message_ul);
				let tstr=DSTORE;
				let siz=tstr.length;
				print("tstr:",tstr);
				print("tstr.length",tstr.length);
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

		// Publish thru MQTT					
		//let okul = MQTT.pub(topic_ul, JSON.stringify(message_ul), 1);
		let okul = MQTT.pub(topic_ul, DSTORE, 1);		
  		print('Published:', okul, topic_ul, '->', DSTORE);  	
				  				
  		// Wait for some time for downlink data before sleeping
  		print('Waiting ',DOWNLINK_WINDOW_TIMER_SEG,' seconds for downlink data');	  				  				
  		
  		Timer.set(DOWNLINK_WINDOW_TIMER_SEG*1000, false, function (){
  			
  			// reset counter
			samplescount.counter = 0;
			File.write(JSON.stringify(samplescount),'samplescount.json');	
			print('samplescount.counter set to:',samplescount.counter);
			// disable wifi
			Cfg.set({wifi:{sta:{enable:false}}});
			Cfg.set({wifi:{ap:{enable:false}}});
		
			// Delete data storage
			DSTORE='';
			File.write(DSTORE,'datastore.ndjson');	
			
  			print('Going to sleep for ',MINS_TO_SLEEP,' mins');
  			ESP32.deepSleep(MINS_TO_SLEEP * 60 * 1000 * 1000);     
  		}, null);	       										
  		  						  							
	}

},null);

// ************************************************
// listen to MQTT server topic for dowlink commands
// ************************************************

MQTT.sub(topic_dl,function(conn,topic,msg){
	print('Topic:', topic, 'message:', msg);		
	let conf_dl = JSON.parse(msg);	
		
	if(conf_dl.gpioboardled !== null)
	{settings.gpioboardled = conf_dl.gpioboardled;}
	
	if(conf_dl.minstosleep !== null)
	{settings.minstosleep = conf_dl.minstosleep;}
	
	if(conf_dl.enabledled !== null)
	{settings.enabledled = conf_dl.enabledled;}
	
	if(conf_dl.gpioadc !== null)
	{settings.gpioadc=conf_dl.gpioadc;}

	if(conf_dl.gpiods18b20 !== null)
	{settings.gpiods18b20=conf_dl.gpiods18b20;}

	if(conf_dl.adcr1 !== null)
	{settings.adcr1=conf_dl.adcr1;}

	if(conf_dl.adcr2 !== null)
	{settings.adcr2=conf_dl.adcr2;}
	
	if(conf_dl.adcalfac !== null)
	{settings.adcalfac=conf_dl.adcalfac;}

	if(conf_dl.minstosleep !== null)
	{settings.minstosleep=conf_dl.minstosleep;}
	
	if(conf_dl.segsnonetimeout !== null)
	{conf_dl.segsnonetimeout=settings.segsnonetimeout;}

	if(conf_dl.segsdownlinktime !== null)
	{settings.segsdownlinktime=conf_dl.segsdownlinktime;}
	
	// {"readconf":true} publish actual setup
	if(conf_dl.readconf !== null )
	{
		if(conf_dl.readconf === true)
		{
			// add sensor id 
			let settingstmp = settings;
			settingstmp["sensor_id"]=DEVICE_ID;
			let okul = MQTT.pub(topic_conf_ul, JSON.stringify(settingstmp), 1);
		}		
	}		
	
	// saving changes to config file
	File.write(JSON.stringify(settings),'settings.json');
	
	// {"reboot":true} reboot system now
	if(conf_dl.reboot !== null)
	{
		if(conf_dl.reboot === true)
		{Sys.reboot(1);}		
	}		

	
},null);

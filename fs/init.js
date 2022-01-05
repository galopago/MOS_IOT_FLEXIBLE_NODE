
load('api_timer.js');
load('api_neopixel.js');
load('api_mqtt.js');
load('api_i2c.js');
load('api_gpio.js');
load('api_esp32.js');


let random=ffi('float mgos_rand_range(float,float)');

let iopin = 13, numPixels = 50, colorOrder = NeoPixel.GRB, i = 0;

let strip = NeoPixel.create(iopin, numPixels, colorOrder);

let FRAME_TICK_MS=5000;

let colval;

let activepalette=0;


let topicu = '/mosiotnode/uplink';
let topicd = '/mosiotnode/downlink';

let LM75A_I2C_ADDR=0x48;
let	GPIOLED =2;
let MIN_TO_SLEEP = 2;
// ********************************************************
// Palette colors (RGB) are packed for compact code writting
// 0xBBGGRR
// ********************************************************	

// **** Autumn palette ****
// red=255,brown=1039,orange=16639,yellow=65535,silver=937807
let autumn_palette=[255, 1039, 16639, 65535, 937807];
let autumn_palette_size=autumn_palette.length;

// **** Christmas palette ****
// pomogreen=13056,sprigreen=39168,oryellow=52479,cinnabar=13260,firebrick=153
let christmas_palette=[13056, 39168, 52479, 13260, 153];
let christmas_palette_size=christmas_palette.length;

// **** allwhite palette (max power output test) ****
// allwhite=16777215
let allwhite_palette=[16777215, 16777215, 16777215, 16777215, 16777215];
let allwhite_palette_size=allwhite_palette.length;


// *** LM75A onboard debug LED setup //
GPIO.set_pull(GPIOLED,GPIO.PULL_NONE);
GPIO.set_mode(GPIOLED,GPIO.MODE_OUTPUT);

// *** LM75A sensor setup //
// Address 1001+ABCD
// 0x48
let LM75A=I2C.get();


/**
* return integer random number between min and max
* @param {int} min random number interval
* @param {int} max random number interval
* @returns {int} generated random number
*/

let randomint=function(min,max){
	let floatres;
	let intres;
	floatres=random(min,max+1)
	intres=(0 | floatres);				// truncate decimal part

	// extreme low probablility case:
	if(intres>max)
		{
			intres = intres-1;
		}
	return intres;
};

// ************************************************
// listen to MQTT server topic to change color palette
// ************************************************

MQTT.sub(topic,function(conn,topic,msg){
	print('Topic:', topicd, 'message:', msg);
	activepalette=JSON.parse(msg);
},null);




// ************************************************
// read temperature each 10 segs
// ************************************************

Timer.set(10000, Timer.REPEAT, function() {
	let temperature=I2C.readRegW(LM75A,LM75A_I2C_ADDR,0x00);
	print('temperature',temperature);
	let temperatureC = 0.12;
	if(temperature < 32768)
	{
		temperatureC = (temperature/256);
	}
	else
	{
		temperatureC =( (temperature - 65535)-1)/256;
	}
	
	//let temperatureC = (temperature/256);
	print('temperature C',temperatureC);
	GPIO.toggle(GPIOLED);
	ESP32.deepSleep(MIN_TO_SLEEP * 60 * 1000 * 1000);
}, null);

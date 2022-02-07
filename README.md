# MOS_IOT_FLEXIBLE_NODE

mosquitto_pub -h test.mosquitto.org -t "/mosiotnode/DEVICE_ID/downlink" -m '{"minstosleep":30,'countsfortx':12}'
mosquitto_sub -h test.mosquitto.org -t "/mosiotnode/uplink"
mos config-set testmode.enable=false


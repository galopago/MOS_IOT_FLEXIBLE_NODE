# MOS_IOT_FLEXIBLE_NODE

mosquitto_pub -h test.mosquitto.org -t "/mosiotnode/dev_id/downlink" -m '{"minstosleep":30,'countsfortx':12}'
mosquitto_sub -h test.mosquitto.org -t "/mosiotnode/uplink"

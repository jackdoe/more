#!/bin/bash
base=`dirname $0`
sudo docker kill $(sudo docker ps | grep 4567 | cut -f 1 -d ' ') # no memory for everything :)

mvn clean package
sudo docker build . -t more

sudo docker run -d -e "VIRTUAL_HOST=more.run,www.more.run" -e "LETSENCRYPT_HOST=more.run,www.more.run" -e "LETSENCRYPT_EMAIL=jack@prymr.nl" more

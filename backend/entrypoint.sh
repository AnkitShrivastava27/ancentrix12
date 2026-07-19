#!/bin/bash
mkdir -p /home/data/uploads /home/data/chroma_data
exec /usr/local/bin/supervisord -c /etc/supervisord.conf
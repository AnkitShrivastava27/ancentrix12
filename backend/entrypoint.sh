#!/bin/bash
mkdir -p /home/data/uploads /home/data/chroma_data
exec supervisord -c /etc/supervisord.conf
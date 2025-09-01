sudo useradd -m -s /bin/bash sn-digest
sudo mkdir -p /srv/rsync/supernote/EXPORT
sudo chown -R sn-digest:sn-digest /srv/rsync

# to be delete after testing
netsh advfirewall firewall add rule name="WSL2 SSH" dir=in action=allow protocol=TCP localport=22
netsh interface portproxy add v4tov4 listenport=22 listenaddress=0.0.0.0 connectport=22 connectaddress=172.21.249.24

# perform in termux
ssh digest@your.server.com "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
cat ~/.ssh/id_ed25519.pub | ssh digest@your.server.com "cat >> ~/.ssh/authorized_keys"
# Fleet Overview

**Fleet Overview** is a web application that generates a real time chart of your current fleet composition.

![alt text](screenshot.png "Screenshot")


### How to run it

**Prerequisites**:
* [docker](https://docs.docker.com/)    


Create an [API-Key](https://developers.eveonline.com/) with the "esi-fleets.read_fleet.v1" as the scope and your '{your-domain.com}/callback/' as the callback. 



1. Clone the repo
```shell
git clone https://gitlab.com/techfreak/fleet-overview
```

2. Modify the data/config.json. Id is the client_id from the api-key and secret is the client_secret from the api-key.
``` json 
{
  "id": "",
  "secret": "",
  "domain": ""
}
```

3. Edit the data/filters.json so it reflects your fleet setups. **all** means that everybody who is logged in can select and see that filter.**{corp_id}** means that only people in that corp can see the filter. That also means they currently can't see all filter but I am maybe gonna change that in the future.  
``` json 
{
  "all": {
    "Carriers": ["Archon", "Chimera", "Thanatos", "Nidhoggur"],
    "Dreads": ["Revelation", "Phoenix", "Moros", "Naglfar"],
    "Machariels": ["Machariel"]
  },
  "98422578": {
    "Ventures": ["Venture"]
  }
}
```


4. Now run the application:
```shell
docker-compose up -d
```

5. **Profit** !


### Acknowledgments


### Authors
* techfreak

### License
This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details


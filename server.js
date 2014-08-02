//
// # SimpleServer
//
// A simple chat server using Socket.IO, Express, and Async.
//
var http = require('http');
var path = require('path');

var async = require('async');
var request = require("request");
var express = require('express');
var session = require("express-session");
var bodyParser = require("body-parser");
var levels = require("./levels");
var handlebars = require("handlebars");
var fs = require("fs");
var countries = require("country-data").countries;
var homePage = handlebars.compile(fs.readFileSync("./public/index.hbs").toString())({
  countries: countries.all
});
var vorbis = require("vorbis");
var ogg = require("ogg");
var lame = require("lame"); // for MP3
var wav = require("wav"); // for WAVE files
//

var redis = require("redis");
var router = express();

router.use(express.static(path.resolve(__dirname, "public")));
router.use(session({secret:"Triple Secret"}));
router.use(bodyParser.json());
router.use(bodyParser.urlencoded());

var API_KEY = "009057c6287f8c80a49053c3c8c2da500b6abb3f9a925a737";

router.get("/", function(req, res) {
  console.log(req.query);
  if(req.query.lang) {
    req.session.lang = req.query.lang;
  } else {
    delete req.session.lang;
  }
  res.end(homePage);
});

router.get("/words/:level", function(req, res) {
  console.log(req.params.level);
  var url = "http://api.wordnik.com/v4/words.json/randomWords?api_key=" + API_KEY +"&";
    var level = levels[req.params.level];
    for(var key in level) {
        url += key + "=" + level[key] + "&";
    }
    url += "limit=5&hasDictionaryDef=true&excludePartOfSpeech=proper-noun,given-name,family-name";
    console.log(url);
    request.get(url, function(err, resp, body) {
      body = JSON.parse(body);
        var ret = [];
        for(var i = 0; i < body.length; i++) {
            ret.push(body[i].word);
        }
        console.log(ret);
        console.log(req.session.lang);
        if(req.session.lang) {
          request.post({
            url:"https://datamarket.accesscontrol.windows.net/v2/OAuth2-13/",
            form: {
              client_id:"GeoSpell",
              client_secret:"Ih3WEJAkSf9oMC0RxhvXoaYFyypiq8BWw7s0lXKu+O4=",
              scope:"http://api.microsofttranslator.com",
              grant_type:"client_credentials"
            }
          },
          function(err, fds, body) {
            
            body = JSON.parse(body);
             request.get({
            url: "http://api.microsofttranslator.com/V2/Http.svc/Translate?Text=" + ret.join(",") + "&To=" + req.session.lang + "&From=en"
            ,headers: {
              Authorization: "Bearer " + body.access_token
            }
          }, function(err, resp, body) {
            body = body.substring(68, body.length -9);
            console.log("here");
            console.log(body);
            res.json(body.split(/,|、|，/))
          }); 
          });
         
        } else {
          res.json(ret);
        }
    }); 
});

router.get("/speech/:word", function(req, res) {
      var mp3 = request.get(
        "http://translate.google.com/translate_tts?ie=UTF-8&tl=en&q=" + req.params.word);
      if(req.query.type === "mp3") {
        mp3.pipe(res);
      } else if(req.query.type === "ogg") {
        var mp3Decoder = new lame.Decoder();
        mp3.pipe(mp3Decoder);

        mp3Decoder.on("format", function() {
          var vorbisEncoder = new vorbis.Encoder();
          mp3Decoder.pipe(vorbisEncoder);

          var oggEncoder = new ogg.Encoder();
          vorbisEncoder.pipe(oggEncoder.stream());
   
          oggEncoder.pipe(res);
        });
      } else if(req.query.type === "wav") {
        mp3
          .pipe(lame.Decoder())
          .pipe(wav.Writer())
          .pipe(res);
      }
});

var client = redis.createClient(16181, "pub-redis-16181.us-east-1-2.1.ec2.garantiadata.com");

router.get("/leaderboard/:board", function(req, res) {
  client.zrevrange(req.params.board, 0, req.query.end || 9, "WITHSCORES", function(err, keys) {
    var obj = {};
    for(var i = 0; i < keys.length; i += 2) {
  obj[keys[i]] = {
            value: keys[i+1],
            rank:i/2 + 1
          }    }
    res.json(obj);
  });
});

router.post("/leaderboard/:board", function(req, res) {
  client.zadd(req.params.board, req.body.score, req.body.email, function(err) {
    if(err) {
      res.end(err);
    }
    client.get("average:" + req.params.board, function(err, avg) {
      if(!avg) avg = req.body.score;
      client.set("average:" + req.params.board, (avg + req.body.score) /2, function(err, avg) {
        
      });
    });
  });
});

router.get("/averages", function(req, res) {
  console.log("fsdfsddsf");
  client.keys("average:*", function(err, keys) {
    async.map(keys, function(key, cb) {
      client.get(key, function(err, value) {
        cb(err, {
          county: key.slice("average:".length),
          average:value
        });
      });
    }, function(err, values) {
      console.log("sdfdfsdsf");
      if(err) {
        console.log(err);
        res.writeHead(500);
      } else {
        res.json(values);
      }
    });
  });
});

router.get("/leaderboard/:board/:name", function(req, res) {
  client.zrank(req.params.board, req.params.name, function(err, rank) {
    if(rank === undefined) {
      res.json({});
    } else {
      client.zrevrange(req.params.board, rank, rank+10, "WITHSCORES", function(err, keys) {
        var obj = {};
        for(var i = 0; i < keys.length; i += 2) {
          obj[keys[i]] = {
            value: keys[i+1],
            rank:(rank+i/2) + 1
          }
        }
        res.json(obj);
      });
    }
  });
});

router.get("/postcode/:postcode", function(req, res) {
  request.get("https://maps.googleapis.com/maps/api/geocode/json?address=" + req.params.postcode, function(err, s, body) {
    body = JSON.parse(body);
    console.log(body);
    console.log(req.params.postcode);
    if(!body.results.length) {
      res.writeHead(404);
    } else {
      res.json(body.results[0].address_components[body.results[0].address_components.length-2].long_name);
    }
  });
});

http.createServer(router).listen(process.env.PORT, process.env.IP);
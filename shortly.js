var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var sqlite3 = require('sqlite3');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var SQLiteStore = require('connect-sqlite3')(express);
var Promise = require('bluebird');
var bcrypt = Promise.promisifyAll(require('bcrypt-nodejs'));

var app = express();
app.use(cookieParser());


var sessionStore = new SQLiteStore();

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(partials());
  app.use(express.json());
  app.use(express.bodyParser());
  app.use(express.static(__dirname + '/public'));
  app.use(cookieParser());
  app.use(session({
    secret: 'itsasecret',
    key: 'sid',
    store: sessionStore,
    cookie: {
      maxAge: 60000,
    }
  }));
});

// instead of rendering automatically, check first if user is authenticated
app.get('/index', function(req,res){
  console.log('request for index');
  res.render('index');
});

app.get('/', function(req, res){
  res.render('login');
});

app.get('/create', function(req, res) {
  res.render('index');
});

app.get('/links', function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/signup', function(req, res){
  var user = req.body.username;
  var pass = req.body.password;
  db.knex('users').where('username','=',user)
  .then(function(resp){
    if (resp.length) { // length >0 implies user eixsts
      res.render('userexists');
    } else {
      console.log('user does not exist');

      bcrypt.hashAsync(pass, null, null)
      .then(function(hash){
        db.knex('users')
        .insert({
          username: user,
          password: hash,
        })
      .then(function(){
          res.render('login');
          console.log('successful insert');
        });
      });
    }
  });
});

app.post('/login', function(req, res){
  var user = req.body.username;
  var pass = req.body.password;
  db.knex('users').where('username', '=', user)
  .then(function(resp){
    if(!resp.length || resp[0].password !== pass){

      res.render('loginfail');
    }

    // this works now
    bcrypt.compareAsync(pass, resp[0].password)
    .then(function(response){
      if (response) {
        res.redirect('/index');
      } else {
        res.render('loginfail');
      }
    });
  });
});

/************************************************************/
// INSERT LATE NOTES ON TESTING, COOKIES ARE A MAGICAL PLACE
// 1. line 93-95 sets variables in the res.cookie
// 2. res.cookie gets taken by the client and is used
//  access the cookie from the request by req.cookies
//  the s at the end is key!
// 3. however, res.sessionID also returns a sessionID
//  sessionID is not stored in the cookie, although...
//    sessionID is the first part of cookies.sid
//  the above overwrites sid, but does not overwrite sessionID
// 4. req.cookies is viewable from chrome console
/************************************************************/

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/links', function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/



/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {

  console.log('**************************************', req.url);
  console.log('req cookies|', req.cookies.sid);
  console.log('sessionStore', sessionStore.db.filename);
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);

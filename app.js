//jshint esversion:6
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const https = require('https');
const mongoose = require("mongoose");
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const session = require('express-session');
const flash = require('express-flash')
const MongoDbStore = require('connect-mongodb-session')(session)
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require("mongoose-findorcreate");

const app = express();

let data = '';
let labels = [];


mongoose.connect("mongodb+srv://admin-vasanti:test123@cluster0.mmek7.mongodb.net/myFirstDatabase?retryWrites=true/recipeDB", { useNewUrlParser: true, useCreateIndex:true, useUnifiedTopology: true, useFindAndModify : true });
const connection = mongoose.connection;
connection.once('open', () => {
    console.log('Database connected...');
}).catch(err => {
    console.log('Connection failed...')
});
mongoose.set("useCreateIndex", true);



var store = new MongoDbStore({
    uri: 'mongodb://localhost:27017/recipeDB',
    collection: 'mySessions'
  });

app.use(session({
    secret : "my little secret",
    resave: false,
    store:store,
    saveUninitialized : false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hour
}));

app.use(passport.initialize());
app.use(passport.session());
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));
app.use(flash())

app.use((req, res, next) => {
    res.locals.session = req.session
    res.locals.user = req.user
    res.locals.message = req.flash()
    next()
})

const recipeSchema = new mongoose.Schema({
    userId:{
        type: mongoose.Schema.Types.ObjectId,
        ref:'User',
        required: true
    },
    img : Buffer,
    label : String
}, { timestamps: true });

const Recipe = mongoose.model("Recipe", recipeSchema);

const userSchema = new mongoose.Schema({
    email : String,
    password : String,
    googleId : String
});
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model('User', userSchema);

passport.use(User.createStrategy());
passport.serializeUser(function(user, done) {
    done(null, user.id);
  });
  
  passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
      done(err, user);
    });
  });


passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/recipe",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({username: profile.emails[0].value, googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

app.get('/', (req, res) => {
    res.render('index', {labels : labels});
});
app.get('/auth/google', 
    passport.authenticate('google',{scope: ['profile',"email"]})
);
app.get('/auth/google/recipe', 
  passport.authenticate("google", { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/');
  });
app.get('/register', (req, res) => {
    res.render('register');
})
app.get('/login', (req, res) => {
    res.render('login');
})
app.get('/recipe', (req, res) => {
    res.render('index', {labels : labels});
}); 
app.post('/', (req, res) => {
    const recipeName = req.body.recipeInput;
   
    const url = "https://api.edamam.com/search?q=" + recipeName +"&app_id=a73811c5&app_key=0f182fa2401706f3a895c5c953eac964&from=0&to=30";
    
    https.get(url, (resp) => {
        resp.on('data', (chunk) => {
            data += chunk;
        }).on('end', () => {
            const recipeData = JSON.parse(data);
            for(var i = 0 ; i < recipeData.hits.length; i++){
                 const recipeItem = {
                    img : recipeData.hits[i].recipe.image,
                    label : recipeData.hits[i].recipe.label,
                    healthLabels : recipeData.hits[i].recipe.healthLabels,
                    ingredientLines : recipeData.hits[i].recipe.ingredientLines,
                    recipeUrl : recipeData.hits[i].recipe.url,
                    calries : recipeData.hits[i].recipe.calories,
                    ttalNutrients : recipeData.hits[i].recipe.totalNutrients
                 }
               labels.push(recipeItem);
               data = '';
             }
           res.redirect('/recipe');
        });
    });
});


app.get('/recipe/:recipeLabel',(req, res) => {
    const requestedLabel = req.params.recipeLabel;
    labels.forEach((item) => {
        const stredLabel = item.label;
        if(stredLabel === requestedLabel){
            res.render('recipe', {
                label : item.label,
                 recipeImg : item.img, 
                 ingredients : item.ingredientLines, 
                 healthLabels : item.healthLabels, 
                 recipeUrl : item.recipeUrl, 
                 ttalNutrients : item.ttalNutrients,
                 calries : item.calries
            })
        }
    })
});

app.get('/collection',(req, res) => {
    if(req.isAuthenticated()){
        Recipe.find({userId: req.user._id},null,{sort: {'createdAt': -1}}, (err, fundItems) => {
            if(fundItems.length === 0){
                res.render('emptyCollection');
            }else if(!err){
                 res.render('collection',{cllectins : fundItems});
             }
           });
    }else{  
        res.redirect("/login");
    }
});

app.post('/collection', (req, res) => {
   const stredLabel = req.body.label;
    if(req.isAuthenticated()){
    for (const i in labels) {
      if(stredLabel === labels[i].label){
          const recipe = new Recipe({
            userId: req.user._id,
            img : labels[i].img,
            label : req.body.label
          });
          recipe.save();
      }
    }
}
    res.redirect('/collection');
});

app.post('/register',(req, res) => {
  
        User.register({username : req.body.username}, req.body.password, (err, user) => {
            if(err){
                
                    req.flash('error',err.message);
                    res.redirect('/register');
            }else{
                passport.authenticate("local")(req, res,() => {
                     res.redirect("/collection");
                });
            }
        })
    const email =  req.body.username;
    var data = {
            members : [
                {
                    email_address : email,
                    status : 'subscribed'
                }
            ]
        }
    const jsonData = JSON.stringify(data);
    const url = "https://us2.api.mailchimp.com/3.0/lists/9c7888bdb5";
    const options = {
        method : "POST",
        auth : "vasanti:41128428b0ee33468c8b8be3fa6e9392-us2"
    }
    const request = https.request(url, options, (response) =>{
            response.on('data', (data) => {
        });
    });
    request.write(jsonData);
    request.end();
    labels =  [];
});
app.post('/login', (req, res) =>{
    const user = new User({
         username : req.body.username,
         password : req.body.password
    })
    req.login(user, (err) => {
        if(err){
            req.flash('error',err.message);
            res.redirect('/login')
        }
        else{
            passport.authenticate('local', { failureRedirect: '/login' , failureFlash: true})(req, res, () => {
                res.redirect('/collection');
            });
        }
    })
});
app.get('/logout', (req, res) => {
         req.logout();
        res.redirect('/');
        // labels = [];
})
app.post("/delete", (req, res) => {
    const selectedItem = req.body.recipe;
    Recipe.deleteOne({_id: selectedItem}, (err) =>{
            if(!err){
                res.redirect("/collection");
            }
         });
})

let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}
app.listen(port);


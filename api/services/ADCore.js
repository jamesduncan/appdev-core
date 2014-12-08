/**
 * ADCore
 *
 * @module      :: Service
 * @description :: This is a collection of core appdev features for an application.

 *
 */
var $ = require('jquery-deferred');
var AD = require('ad-utils');

module.exports = {


    auth: {

        isAuthenticated: function( req ) {

            if (req.session.authenticated) {
                return true;
            } else {
                return false;
            }

        },



        local: {
            isAuthenticated:function(req, res, next) {
            ////TODO: <2014/1/24> Johnny : Implement a Local Auth option
                // this is used by policy/sessionAuth.js to determine if a
                // user is authenticated, and if not, what to do to begin the
                // process of authenticating them...
                // handle both web service request & web page requests

                // until this is implemented:
                ADCore.auth.markAuthenticated(req, 'anonymous.coward');

                next();
            }
        },


        
        // @param httpRequest req
        // @param string/object properties
        //      Either a string for guid
        //      or a basic object containing
        //          - guid
        //          - username
        //          - password
        //          - languageCode
        markAuthenticated: function(req, properties) {
            if (typeof properties == 'string') {
                properties = { guid: properties };
            }
            
            req.session.authenticated = true;
            req.session.appdev = req.session.appdev || ADCore.session.default();
            req.session.appdev.auth.guid = properties.guid;
            ADCore.user.init(req, properties);
        },



        markNotAuthenticated: function(req) {
            req.session.authenticated = false;
            req.session.appdev = { auth:{}, user:null, actualUser:null };  // drop all appdev info
        }
    },


    comm:{

        error:function(res, err, code) {

            var packet = {
                status:'error',
                data:err
            };

            // add in optional properties: id, message
            if (err.id) packet.id = err.id;
            if (err.message) packet.message = err.message;

            // default to HTTP status code: 400
            if ('undefined' == typeof code) code = 400; 

            res.header('Content-type', 'application/json');
            res.send(JSON.stringify(packet).replace('"false"', 'false').replace('"true"', 'true'), code);
        },



        reauth:function(res) {

            var packet = {
                id:5,
                message:'Reauthenticate.',
                authType: sails.config.appdev.authType
            };

            // add in additional auth info depending on
            // authType
            // packet.data[authType]

            packet.data = {};

            if ('CAS' == sails.config.appdev.authType) {
                // include CAS: { uri:'cas/url/here' }
                packet.data[sails.config.appdev.authType] = {
                        message:"1st authenticate with CAS.uri, then call our CAS.authUri:",
                        uri:sails.config.cas.baseURL,
                        authUri: sails.config.appdev.authURI
                }
            }

            if ('local' == sails.config.appdev.authType) {
                
                packet.data[sails.config.appdev.authType] = {
                        message:"submit username=[username]&password=[password] to this uri",
                        method: 'post',
                        uri:sails.config.cas.authURI
                }
            }

            // NOTE: this == ADCore.comm
            this.error(res, packet, 401);
        },



        success:function(res, data, code) {

            var packet = {
                status:'success',
                data:data
            };

            // default to HTTP status code: 200
            if ('undefined' == typeof code) code = 200; //AD.Const.HTTP.OK;  // 200: assume all is ok

            res.header('Content-type', 'application/json');
            res.send(JSON.stringify(packet).replace('"false"', 'false').replace('"true"', 'true'), code);
        }

    },



    hasPermission: function(req, res, next, actionKey) {
        // only continue if current user has an actionKey in one of their
        // permissions.

//// TODO: <2013/12/12> Johnny : uncomment the unit tests for this action
////       when implemented.

// console.log('ADCore.hasPermission() :  actionKey:' + actionKey);
        // pull req.session.appdev.user
        // if (user.hasPermission( actionKey) ) {
        //     next();
        // } else {
        //     res.forbidden('you dont have permission to access this resource.');
        // }

        // for now just
        next();
    },



    labelsForContext: function(context, code, cb) {
        var dfd = AD.sal.Deferred();
// AD.log('... labelsForContext():');
// AD.log('... context:'+context);
// AD.log('... code:'+code);

        // verify cb is properly set
        if (typeof code == 'function') {
            if (typeof cb == 'undefined') {
                cb = code;
                code = sails.config.appdev['lang.default']; // 'en';    // <-- this should come from site Default
            }
        }


        // options is the filter for our SiteMultilingualLabel.find()
        // make sure something is set for context
        var options = {
            label_context: context || ''
        };


        // optionally set code if provided
        if (code) {
            options.language_code = code;
        }


        SiteMultilingualLabel.find(options)
        .then(function(data){

            if (cb) cb(null, data);
            dfd.resolve(data);

        })
        .fail(function(err){

            if (cb) cb(err);
            dfd.reject(err);
        });

        return dfd;
    },


    session: {

        /* 
         * return a default session object that we use to manage our ADCore info.
         * @return {json}
         */
        default:function() {

            return { auth:{}, user:null, actualUser:null, socket:{ id:null } }
        }
    },



    socket: {


        /*
         * Return the current user's socket id
         *
         * @param {object} req   The current request object.
         * @return {string}      The stored socket id 
         */
        id:function(req) {

            if (req) {
                if (req.session) { 
                    if (req.session.appdev) {
                        if (req.session.appdev.socket) {

                            return req.session.appdev.socket.id;

                        }
                    }
                }
            }

            // if one of these failed
            var err  = new Error('ADCore.socket.id() called with improper user session defined. ');
            AD.log.error(err);
            return null;

        },



        /*
         * Update the socket ID stored in our req.session.appdev.socket value.
         */
        init: function(req) {

            // make sure this is a socket request
            if (req.isSocket) {

                var id = sails.sockets.id(req.socket);
                if (req.session.appdev.socket.id != id) {
                    AD.log('... <yellow> socket id updated:</yellow> '+req.session.appdev.socket.id +' -> '+id);
                }
                req.session.appdev.socket.id = id;
            }

        }
    },



    user:{

        /*
         * Return who the system should think the current user is.
         *
         * Note: this will report what switcheroo wants you to think.
         *
         * @param {object} req,  the express/sails request object.  User
         *                 info is stored in the req.session.appdev.user
         *                 field.
         */
        current: function (req) {
            return req.session.appdev.user;
        },



        /*
         * Return who the current user actually is.
         *
         * Note: switcheroo can not spoof this.
         *
         * @param {object} req,  the express/sails request object.  User
         *                 info is stored in the req.session.appdev.actualUser
         *                 field.
         */
        actual: function (req) {
            return req.session.appdev.actualUser;
        },


        /**
         * @function init
         *
         * initialize a user object for the current user.
         *
         * @param {object} req,  the express/sails request object.  User
         *                 info is stored in the req.session.appdev.actualUser
         *                 field.
         * @param {object} data   the data to store about this user.  Should at least
         *                  contain { guid: 'xxxxx' }
         *
         */
        init:function(req, data) {
            var user = new User(data)
            req.session.appdev.actualUser = user;
            req.session.appdev.user = user;
            
            // Do it again after async operations complete.
            user.whenReady.done(function(){
                req.session.appdev.actualUser = user;
                req.session.appdev.user = user;
            });
        }
    }
};




/**
 * @class User
 *
 * This object represents the User in the system.
 *
 */
var User = function (opts) {
    this.data = opts || {};
    var self = this;
    
    // This deferred will resolve when the object has finished initializing
    // to/from the DB.
    self.whenReady = AD.sal.Deferred();

    // Internal reference to the DB model
    this.user = null;
    
    // Initialization may be done from session stored data. In which case
    // the data is already loaded and we won't need to do a find().
    var shouldFind = false;
    if (!this.data.isLoaded) {
        // Typically you would init by guid, username, or username+password.
        // We will allow init by other combinations of those fields. There is no 
        // legitimate use for those but it is safe when done server side.
        var findOpts = {};
        [ 'username', 'guid', 'password' ].forEach(function(k) {
            if (opts[k]) {
                findOpts[k] = opts[k];
                shouldFind = true;
            }
        });
    }
    
    if (shouldFind) {
        SiteUser.hashedFind(findOpts)
        .then(function(list){
            if (list[0]) {
                // User found in the DB
                self.user = list[0];
                self.data.guid = self.user.guid;
                self.data.languageCode = self.user.languageCode;
                self.data.isLoaded = true;
                self.whenReady.resolve();
                
                // Update username / language, and freshen timestamp.
                // Don't really care when it finishes.
                var username = opts.username || list[0].username;
                var languageCode = opts.languageCode || list[0].langaugeCode;
                SiteUser.update(
                    { id: list[0].id }, 
                    { 
                        username: username,
                        languageCode: languageCode
                    }
                )
                .then(function(){});
            }
            else {
                // User not in the DB. Insert now.
                SiteUser.create(opts)
                .then(function(user){
                    self.user = user;
                    self.data.isLoaded = true;
                    self.whenReady.resolve();
                })
                .fail(function(err){
                    console.log('User create failed:', opts, err);
                    self.whenReady.reject(err);
                })
                .done();
            }
        })
        .fail(function(err){
            console.log('User init failed:', findOpts, err);
            self.whenReady.reject();
        })
        .done();
    }
    else {
        self.whenReady.resolve();
    }
    
};



User.prototype.getLanguageCode = function() {
    return this.data.languageCode || 'en';
};



User.prototype.hasPermission = function(key) {
    return true;
};



User.prototype.GUID = function() {
    return this.data.guid;
};



//// LEFT OFF:
//// - figure out unit tests for testing the controller output.
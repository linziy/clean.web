const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils

var EXPORTED_SYMBOLS = ["YoukuAntiADs"];

Cu.import("resource://gre/modules/NetUtil.jsm");

function YoukuAntiADs() {};
YoukuAntiADs.prototype = {
    SITES: {
        'youku_loader': {
            'player': 'chrome://youkuantiads/content/swf/loader.swf',
            're': /http:\/\/static\.youku\.com(\/v[\d\.]+)?\/v\/swf\/loader\.swf/i
        },
        'youku_player': {
            'player': 'chrome://youkuantiads/content/swf/player.swf',
            're': /http:\/\/static\.youku\.com(\/v[\d\.]+)?\/v\/swf\/q?player[^\.]*\.swf/i
        },
        'ku6': {
            'player': 'chrome://youkuantiads/content/swf/ku6.swf',
            're': /http:\/\/player\.ku6cdn\.com\/.*\/\d+\/player\.swf/i
        },
        'iqiyi': {
            'player0': 'chrome://youkuantiads/content/swf/iqiyi_out.swf',
            'player1': 'chrome://youkuantiads/content/swf/iqiyi5.swf',
            'player2': 'chrome://youkuantiads/content/swf/iqiyi.swf',
            're': /http:\/\/www\.iqiyi\.com\/player\/\d+\/player\.swf/i
        },
        'tudou': {
            'player': 'chrome://youkuantiads/content/swf/tudou.swf',
            're': /http:\/\/js\.tudouui\.com\/.*portalplayer[^\.]*\.swf/i
        },
        'tudou_olc': {
            'player': 'chrome://youkuantiads/content/swf/olc_8.swf',
            're': /http:\/\/js\.tudouui\.com\/.*olc[^\.]*\.swf/i
        },
        'tudou_sp': {
            'player': 'chrome://youkuantiads/content/swf/sp.swf',
            're': /http:\/\/js\.tudouui\.com\/.*\/socialplayer[^\.]*\.swf/i
        },
        'letv': {
            'player': 'chrome://youkuantiads/content/swf/letv.swf',
            're': /http:\/\/.*letv[\w]*\.com\/.*\/(?!Live)[\w]{4}Player[^\.]*\.swf/i
        },
        'pplive': {
            'player': 'chrome://youkuantiads/content/swf/pplive.swf',
            're': /http:\/\/player\.pplive\.cn\/ikan\/.*\/player4player2\.swf/i
        },
        'pplive_live': {
            'player': 'chrome://youkuantiads/content/swf/pplive_live.swf',
            're': /http:\/\/player\.pplive\.cn\/live\/.*\/player4live2\.swf/i
        }
    },
    os: Cc['@mozilla.org/observer-service;1']
            .getService(Ci.nsIObserverService),
    init: function() {
        var site = this.SITES['iqiyi'];
        site['preHandle'] = function(aSubject) {
            var wnd = this.getWindowForRequest(aSubject);
            if(wnd) {
                site['cond'] = [
                    !/^((?!baidu|61).)*\.iqiyi\.com/i.test(wnd.self.location.host),
                    wnd.self.document.querySelector('span[data-flashplayerparam-flashurl]'),
                    true
                ];
                if(!site['cond']) return;
                
                for(var i = 0; i < site['cond'].length; i++) {
                    if(site['cond'][i]) {
                        if(site['player'] != site['player' + i]) {
                            site['player'] = site['player' + i];
                            site['storageStream'] = site['storageStream' + i] ? site['storageStream' + i] : null;
                            site['count'] = site['count' + i] ? site['count' + i] : null;
                        }
                        break;
                    }
                }
            }
        };
        site['callback'] = function() {
            if(!site['cond']) return;

            for(var i = 0; i < site['cond'].length; i++) {
                if(site['player' + i] == site['player']) {
                    site['storageStream' + i] = site['storageStream'];
                    site['count' + i] = site['count'];
                    break;
                }
            }
        };
    },
    // getPlayer, get modified player
    getPlayer: function(site, callback) {
        NetUtil.asyncFetch(site['player'], function(inputStream, status) {
            var binaryOutputStream = Cc['@mozilla.org/binaryoutputstream;1']
                                        .createInstance(Ci['nsIBinaryOutputStream']);
            var storageStream = Cc['@mozilla.org/storagestream;1']
                                    .createInstance(Ci['nsIStorageStream']);
            var count = inputStream.available();
            var data = NetUtil.readInputStreamToString(inputStream, count);

            storageStream.init(512, count, null);
            binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));
            binaryOutputStream.writeBytes(data, count);

            site['storageStream'] = storageStream;
            site['count'] = count;

            if(typeof callback === 'function') {
                callback();
            }
        });
    },
    getWindowForRequest: function(request){
        if(request instanceof Ci.nsIRequest){
            try{
                if(request.notificationCallbacks){
                    return request.notificationCallbacks
                                .getInterface(Ci.nsILoadContext)
                                .associatedWindow;
                }
            } catch(e) {}
            try{
                if(request.loadGroup && request.loadGroup.notificationCallbacks){
                    return request.loadGroup.notificationCallbacks
                                .getInterface(Ci.nsILoadContext)
                                .associatedWindow;
                }
            } catch(e) {}
        }
        return null;
    },
    observe: function(aSubject, aTopic, aData) {
        if(aTopic != 'http-on-examine-response') return;

        var http = aSubject.QueryInterface(Ci.nsIHttpChannel);
        for(var i in this.SITES) {
            var site = this.SITES[i];
            if(site['re'].test(http.URI.spec)) {
                var fn = this, args = Array.prototype.slice.call(arguments);

                if(typeof site['preHandle'] === 'function')
                    site['preHandle'].apply(fn, args);

                if(!site['storageStream'] || !site['count']) {
                    http.suspend();
                    this.getPlayer(site, function() {
                        http.resume();
                        if(typeof site['callback'] === 'function')
                            site['callback'].apply(fn, args);
                    });
                }

                var newListener = new TrackingListener();
                aSubject.QueryInterface(Ci.nsITraceableChannel);
                newListener.originalListener = aSubject.setNewListener(newListener);
                newListener.site = site;

                break;
            }
        }
    },
    QueryInterface: function(aIID) {
        if(aIID.equals(Ci.nsISupports) || aIID.equals(Ci.nsIObserver))
            return this;

        return Cr.NS_ERROR_NO_INTERFACE;
    },
    register: function() {
        this.init();
        this.os.addObserver(this, 'http-on-examine-response', false);
    },
    unregister: function() {
        this.os.removeObserver(this, 'http-on-examine-response', false);
    }
};

// TrackingListener, redirect youku player to modified player
function TrackingListener() {
    this.originalListener = null;
    this.site = null;
}
TrackingListener.prototype = {
    onStartRequest: function(request, context) {
        this.originalListener.onStartRequest(request, context);
    },
    onStopRequest: function(request, context) {
        this.originalListener.onStopRequest(request, context, Cr.NS_OK);
    },
    onDataAvailable: function(request, context) {
        this.originalListener.onDataAvailable(request, context, this.site['storageStream'].newInputStream(0), 0, this.site['count']);
    }
};

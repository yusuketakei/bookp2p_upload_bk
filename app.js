// Copyright 2017, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/views'));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60
    }
}));

const url = require('url');
const ejs = require('ejs');
const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
var config = require('config');
const util = require('util');

//mysql Cloud SQL上
const mysql = require('mysql');
app.enable('trust proxy');

const options = {
    "user": config.user,
    "password": config.password,
    "database": config.database,
    // developmentではhost,port指定 productionではsocketPath
    "host": config.host,
    "port": config.port,
    "socketPath": config.socketPath
};

//optionsの内容でSQLコネクション
const connection = mysql.createConnection(options);

//zxingのurlのクエリストリングに使われるデリミタ
const ZXING_QUERYSTRING_DELIM = "!" ;

//最新検索時の最大件数
const MAX_SEARCH_SIZE = 50;

//STATUS系固定値
const STATUS_UPLOADED = "0" ;
const STATUS_ADDED = "1" ;
const STATUS_DELETE_UPLOADED = "8" ;
const STATUS_DELETED = "9" ;
const STATUS_UPLOADED_STR = "仮登録";
const STATUS_ADDED_STR = "登録済";

//授受系固定値
const TRN_TYPE_REQUEST = "0" ;
const TRN_TYPE_RENTAL_START = "1" ;
const TRN_TYPE_RENTAL_END = "2" ;
const TRN_TYPE_REQUEST_STR = "リクエスト" ;
const TRN_TYPE_RENTAL_START_STR = "借りる本の確認" ;
const TRN_TYPE_RENTAL_END_STR = "返却された本の確認" ;

//検索モード
const SEARCH_MODE_ISBN = 0 ;
const SEARCH_MODE_ALL = 1 ;

/* status=0(アップロード済み)のものをダウンロード用に表示して、status=1(追加済み)にする */

/* ダウンロード用の旧バージョン機能 ここから*/
//書籍公開時のダウンロード用
app.get('/addBook', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //パラメータからaccountを取得
    if (url_parts.query.account) {
        var account = url_parts.query.account;
    } else {
        var account = "";
    }

    //書籍追加用の情報を取得
    getBookListByStatus(account,STATUS_UPLOADED,
        function (dbRes) {
            //書籍を追加済みのステータスにする
            updateBookStatusByAccount(account, STATUS_UPLOADED, STATUS_ADDED, null);
            //取得した書籍情報をJSONとしてレンディング
            var json = JSON.stringify(dbRes);
            res.header('Content-Type', 'text/plain;charset=utf-8');
            res.header('Access-Control-Allow-Origin', '*');
            res.write(json);
            res.end();
        }
    );

});

//書籍削除時のダウンロード用
app.get('/removeBook', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //パラメータからaccountを取得
    if (url_parts.query.account) {
        var account = url_parts.query.account;
    } else {
        var account = "";
    }

    //書籍削除用の情報を取得
    getBookListByStatus(account,STATUS_DELETE_UPLOADED,
        function (dbRes) {
            //書籍を削除済みのステータスにする
            updateBookStatusByAccount(account, STATUS_DELETE_UPLOADED, STATUS_DELETED, null);
            //取得した書籍情報をJSONとしてレンディング
            var json = JSON.stringify(dbRes);
            res.header('Content-Type', 'text/plain;charset=utf-8');
            res.header('Access-Control-Allow-Origin', '*');
            res.write(json);
            res.end();
        }
    );

});

//取引のダウンロード用
app.get('/doTrn', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //パラメータからaccountを取得
    if (url_parts.query.account) {
        var account = url_parts.query.account;
    } else {
        var account = "";
    }

    //取引用の情報を取得
    getTrnListByStatus(account,STATUS_UPLOADED,
        function (dbRes) {
            //取引を追加済みのステータスにする
            updateTrnStatusByAccount(account, STATUS_UPLOADED, STATUS_ADDED, null);
            //取得した書籍情報をJSONとしてレンディング
            var json = JSON.stringify(dbRes);
            res.header('Content-Type', 'text/plain;charset=utf-8');
            res.header('Access-Control-Allow-Origin', '*');
            res.write(json);
            res.end();
        }
    );

});

/* ダウンロード用の旧バージョン機能 ここまで*/

//書籍公開用のリスト取得
app.get('/getAddBookList', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //パラメータからaccountを取得
    if (url_parts.query.account) {
        var account = url_parts.query.account;
    } else {
        var account = "";
    }

    //書籍追加用の情報を取得
    getBookListByStatus(account,STATUS_UPLOADED,
        function (dbRes) {
            //取得した書籍情報をJSONとしてレンディング
            var json = JSON.stringify(dbRes);
            res.header('Content-Type', 'text/plain;charset=utf-8');
            res.header('Access-Control-Allow-Origin', '*');
            res.write(json);
            res.end();
        }
    );

});

//書籍の登録確定
app.get('/addBookDone', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //パラメータからaccountを取得
    if (url_parts.query.account) {
        var account = url_parts.query.account;
    } else {
        var account = "";
    }

    //パラメータからisbnを取得
    if (url_parts.query.isbn) {
        var isbn = url_parts.query.isbn;
    } else {
        var isbn = "";
    }

    
    //書籍追加用の情報を取得
    updateBookStatusByAccountIsbn(account,isbn,STATUS_UPLOADED,STATUS_ADDED,
        function (dbRes) {
            //取得した書籍情報をJSONとしてレンディング
            var json = JSON.stringify(dbRes);
            res.header('Content-Type', 'text/plain;charset=utf-8');
            res.header('Access-Control-Allow-Origin', '*');
            res.write(json);
            res.end();
        }
    );

});

//書籍削除用のリスト取得
app.get('/getDeleteBookList', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //パラメータからaccountを取得
    if (url_parts.query.account) {
        var account = url_parts.query.account;
    } else {
        account = "";
    }

    //書籍のステータスを追加済みに更新
    getBookListByStatus(account,STATUS_DELETE_UPLOADED,
        function (dbRes) {
            //取得した書籍情報をJSONとしてレンディング
            var json = JSON.stringify(dbRes);
            res.header('Content-Type', 'text/plain;charset=utf-8');
            res.header('Access-Control-Allow-Origin', '*');
            res.write(json);
            res.end();
        }
    );

});

//書籍の削除確定
app.get('/deleteBookDone', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //パラメータからaccountを取得
    if (url_parts.query.account) {
        var account = url_parts.query.account;
    } else {
        var account = "";
    }

    //パラメータからisbnを取得
    if (url_parts.query.isbn) {
        var isbn = url_parts.query.isbn;
    } else {
        var isbn = "";
    }

    
    //書籍のステータスを削除済みに更新
    updateBookStatusByAccountIsbn(account,isbn,STATUS_DELETE_UPLOADED,STATUS_DELETED,
        function (dbRes) {
            //取得した書籍情報をJSONとしてレンディング
            var json = JSON.stringify(dbRes);
            res.header('Content-Type', 'text/plain;charset=utf-8');
            res.header('Access-Control-Allow-Origin', '*');
            res.write(json);
            res.end();
        }
    );

});

//取引実行用のリスト取得
app.get('/getTranList', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //パラメータからaccountを取得
    if (url_parts.query.account) {
        var account = url_parts.query.account;
    } else {
        var account = "";
    }

    //取引用の情報を取得
    getTrnListByStatus(account,STATUS_UPLOADED,
        function (dbRes) {
            //取得した書籍情報をJSONとしてレンディング
            var json = JSON.stringify(dbRes);
            res.header('Content-Type', 'text/plain;charset=utf-8');
            res.header('Access-Control-Allow-Origin', '*');
            res.write(json);
            res.end();
        }
    );

});

//取引実行確定
app.get('/tranDone', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //パラメータからaccountを取得
    if (url_parts.query.account) {
        var account = url_parts.query.account;
    } else {
        var account = "";
    }
    //パラメータからisbnを取得
    if (url_parts.query.isbn) {
        var isbn = url_parts.query.isbn;
    } else {
        var isbn = "";
    }
    //パラメータからaccountを取得
    if (url_parts.query.type) {
        var type = url_parts.query.type;
    } else {
        var type = "";
    }

    //取引用の情報を取得
    updateTrnStatusByAccountIsbnType(account,isbn,type,STATUS_UPLOADED,STATUS_ADDED,
        function (dbRes) {
            //取得した書籍情報をJSONとしてレンディング
            var json = JSON.stringify(dbRes);
            res.header('Content-Type', 'text/plain;charset=utf-8');
            res.header('Access-Control-Allow-Origin', '*');
            res.write(json);
            res.end();
        }
    );

});


//クライアントからの検索結果ダウンロードクエリ(登録済み書籍のISBNリストを返す)
app.get('/searchBookQuery', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //パラメータからaccountを取得
    if (url_parts.query.searchKey) {
        var searchKey = url_parts.query.searchKey;
    } else {
        var searchKey = "";
    }

    //返却用
    var returnParams = {};
    returnParams["searchIsbnList"] = [];
    
    if(searchKey){
        searchBookByKey(searchKey,SEARCH_MODE_ISBN,function(isbnList){
            var json = JSON.stringify(isbnList);
            res.header('Content-Type', 'text/plain;charset=utf-8');
            res.header('Access-Control-Allow-Origin', '*');
            res.write(json);
            res.end();        
        });        
    }else{
        getBookIsbnLast(function(isbnList){
            var json = JSON.stringify(isbnList);
            res.header('Content-Type', 'text/plain;charset=utf-8');
            res.header('Access-Control-Allow-Origin', '*');
            res.write(json);
            res.end();        
        });
    }
});

//書籍登録用ののget処理
app.get('/registerBook', (req, res) => {
    res.header('Content-Type', 'text/plain;charset=utf-8');
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //sessionからaccountを取得
    if (req.session.account) {
        var account = req.session.account;
    } else {
        account = "";
    }

    //パラメータからidを取得
    if (url_parts.query.isbn) {
        var isbn = url_parts.query.isbn;
    } else {
        isbn = "";
    }

    getGoogleBookInfoByIsbn(isbn, function (googleBooksInfo) {
        //パラメータ設定
        var ejsParams = {};
        ejsParams["filename"] = "filename";
        ejsParams["account"] = account;
        ejsParams["isbn"] = isbn ;
        if (googleBooksInfo.title) {
            ejsParams["title"] = googleBooksInfo.title ;
            ejsParams["author"] = googleBooksInfo.author ;
            ejsParams["description"] = googleBooksInfo.description ;
        }else{
            ejsParams["title"] = "" ;
            ejsParams["author"] = "" ;
            ejsParams["description"] = "" ;
        }
        //navbar用
        ejsParams["navActive"] = "/";

        //レンダリング
        fs.readFile('./views/registerBook.ejs', 'utf-8', function (err, data) {
            renderEjsView(res, data, ejsParams);
        });


    });

});

//書籍編集用ののget処理
app.get('/editBook', (req, res) => {
    res.header('Content-Type', 'text/plain;charset=utf-8');
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //sessionからaccountを取得
    if (req.session.account) {
        var account = req.session.account;
    } else {
        account = "";
    }

    //パラメータからidを取得
    if (url_parts.query.id) {
        var id = url_parts.query.id;
    } else {
        id = "";
    }

    getBookById(id, function (result) {

        //パラメータ設定
        var ejsParams = {};
        ejsParams["filename"] = "filename";
        ejsParams["account"] = account;
        ejsParams["isbn"] = result[0].isbn || "";
        ejsParams["title"] = result[0].title || "";
        ejsParams["author"] = result[0].author || "";
        ejsParams["description"] = result[0].description || "";
        //navbar用
        ejsParams["navActive"] = "/";

        //セッションに編集対象のidを設定
        req.session.editId = id;

        fs.readFile('./views/editBook.ejs', 'utf-8', function (err, data) {
            renderEjsView(res, data, ejsParams);
        });

    });

});

//書籍編集の保存
app.post('/editBook', (req, res) => {
    //post data
    res.header('Content-Type', 'text/plain;charset=utf-8');
    var updateBook = {};
    updateBook.title = req.body.title || "no data";
    updateBook.author = req.body.author || "no data";
    updateBook.isbn = req.body.isbn || 0;
    updateBook.description = req.body.description || "no data";
    updateBook.status = STATUS_UPLOADED;

    //sessionデータの取得
    updateBook.id = req.session.editId;

    var ejsParams = {};
    ejsParams["account"] = req.session.account || "guest";
    ejsParams["isbn"] = updateBook.isbn;
    ejsParams["book_list"] = {};
    ejsParams["title"] = updateBook.title;
    ejsParams["author"] = updateBook.author;
    ejsParams["description"] = updateBook.description;
    ejsParams["id"] = req.session.editId;
    ejsParams["zxingParam"] = "ret=http://irbookp2p-env.prw2xfpatf.us-east-2.elasticbeanstalk.com/?params=account=" 
        + ejsParams["account"]
        + "!jancode={CODE}" ;
    //express4でejsテンプレートを読み込むための呪文
    ejsParams["filename"] = "filename";
    //navbar用
    ejsParams["navActive"] = "/";
    ejsParams["toastrStr"] = "Edit Book Success"

    getBookListByAccount(req.session.account,function (result) {
        //DBからの一覧取得結果を格納
        if (result) {
            ejsParams["book_list"] = result;
            ejsParams["book_list.length"] = Object.keys(ejsParams["book_list"]).length;
        }
        
        //TODO 同じaccountとISBNの登録はエラーにする Editのボタンを追加済みのものは編集不要にする
        //書籍情報の更新
        updateBookById(updateBook, function (result) {

            //レンダリング
            fs.readFile('./views/zxingUI.ejs', 'utf-8', function (err, data) {
                renderEjsView(res, data, ejsParams);
            });

        });
    });
});

//書籍登録の保存
app.post('/registerBook', (req, res) => {
    //post data
    res.header('Content-Type', 'text/plain;charset=utf-8');
    var registerBook = {};
    registerBook.title = req.body.title || "no data";
    registerBook.author = req.body.author || "no data";
    registerBook.isbn = req.body.isbn || 0;
    registerBook.description = req.body.description || "no data";
    registerBook.status = STATUS_UPLOADED;

    //sessionデータの取得
    registerBook.account = req.session.account;
    
    var ejsParams = {};
    ejsParams["account"] = req.session.account || "guest";
    ejsParams["isbn"] = registerBook.isbn;
    ejsParams["book_list"] = {};
    ejsParams["title"] = registerBook.title;
    ejsParams["author"] = registerBook.author;
    ejsParams["description"] = registerBook.description;
    ejsParams["id"] = 0;
    //express4でejsテンプレートを読み込むための呪文
    ejsParams["filename"] = "filename";
    //navbar用
    ejsParams["navActive"] = "/";
    ejsParams["toastrStr"] = "Register Book Success"
    ejsParams["zxingParam"] = "ret=http://irbookp2p-env.prw2xfpatf.us-east-2.elasticbeanstalk.com/?params=account=" 
        + ejsParams["account"]
        + "!jancode={CODE}";
    
    
    getBookListByAccount(registerBook.account, function (result) {
        //DBからの一覧取得結果を格納
        if (result) {
            ejsParams["book_list"] = result;
            ejsParams["book_list.length"] = Object.keys(ejsParams["book_list"]).length;
        }
        //TODO 同じISBNはエラーにする 
        
        insertBookInfo(registerBook, function (result) {
            //表示する書籍情報の更新
            //insert時のincrement id を取得
            ejsParams["id"] = result.insertId;

            //レンダリング
            fs.readFile('./views/zxingUI.ejs', 'utf-8', function (err, data) {
                renderEjsView(res, data, ejsParams);
            });

        });
    });
});

//書籍削除用ののget処理
app.get('/deleteBook', (req, res) => {
    res.header('Content-Type', 'text/plain;charset=utf-8');
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //sessionからaccountを取得
    if (req.session.account) {
        var account = req.session.account;
    } else {
        account = "";
    }
    
    //パラメータからidを取得
    if (url_parts.query.id) {
        var id = url_parts.query.id;
    } else {
        id = "";
    }

    getBookById(id, function (result) {

        //パラメータ設定
        var ejsParams = {};
        ejsParams["filename"] = "filename";
        ejsParams["account"] = account;
        ejsParams["isbn"] = result[0].isbn || "";
        ejsParams["title"] = result[0].title || "";
        ejsParams["author"] = result[0].author || "";
        ejsParams["description"] = result[0].description || "";
        //navbar用
        ejsParams["navActive"] = "/";

        //セッションに削除対象のidを設定
        req.session.editId = id;

        fs.readFile('./views/deleteBook.ejs', 'utf-8', function (err, data) {
            renderEjsView(res, data, ejsParams);
        });

    });

});

//書籍削除の保存
app.post('/deleteBook', (req, res) => {
    //post data
    res.header('Content-Type', 'text/plain;charset=utf-8');

    //sessionデータの取得
    var id = req.session.editId;

    var ejsParams = {};
    ejsParams["account"] = req.session.account || "guest";
    ejsParams["title"] = "no data";
    ejsParams["id"] = 0;
    ejsParams["book_list"] = {};
    ejsParams["zxingParam"] = "ret=http://irbookp2p-env.prw2xfpatf.us-east-2.elasticbeanstalk.com/?params=account=" 
        + ejsParams["account"]
        + "!jancode={CODE}" ;
    //express4でejsテンプレートを読み込むための呪文
    ejsParams["filename"] = "filename";
    //navbar用
    ejsParams["navActive"] = "/";
    ejsParams["toastrStr"] = "Delete Book Success"

        //特定idの書籍を論理削除
    deleteBookById(id,function(deleteResult){
        getBookListByAccount(req.session.account,function (listResult) {
            //DBからの一覧取得結果を格納
            if (listResult) {
                ejsParams["book_list"] = listResult;
                ejsParams["book_list.length"] = Object.keys(ejsParams["book_list"]).length;
            }        

            //レンダリング
            fs.readFile('./views/zxingUI.ejs', 'utf-8', function (err, data) {
                renderEjsView(res, data, ejsParams);
            });

        });
    });
});

//書籍検索用ののget処理
app.get('/searchBook', (req, res) => {
    res.header('Content-Type', 'text/plain;charset=utf-8');
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //sessionからaccountを取得
    if (req.session.account) {
        var account = req.session.account;
    } else {
        account = "";
    }

    //パラメータ設定
    var ejsParams = {};
    ejsParams["filename"] = "filename";
    ejsParams["account"] = account;
    ejsParams["book_list"] = {};
    ejsParams["book_list.length"] = 0;
    ejsParams["searchKey"] = "";
    ejsParams["zxingParam"] = "ret=http://irbookp2p-env.prw2xfpatf.us-east-2.elasticbeanstalk.com/searchBookByIsbn/?params=account=" 
        + ejsParams["account"]
        + "!jancode={CODE}" ;
    //navbar用
    ejsParams["navActive"] = "/searchBook";


    if (account == "") {
        fs.readFile('./views/noaccount.ejs', 'utf-8', function (err, data) {
            renderEjsView(res, data, ejsParams);
        });
    } else {
        fs.readFile('./views/searchBook.ejs', 'utf-8', function (err, data) {
            renderEjsView(res, data, ejsParams);
        });
    }
});

//書籍の検索実行
app.post('/searchBook', (req, res) => {
    res.header('Content-Type', 'text/plain;charset=utf-8');
    //post data
    var searchKey = req.body.searchKey;

    //返却用
    var returnParams = {
        bookInfoResult: []
    };
    //検索結果をjsonで返す
    //searchKeyが空文字なら最新のもの(追加済み)を返す
    if(searchKey){
        searchBookByKey(searchKey,SEARCH_MODE_ALL,function(bookInfoResult){
            returnParams["bookInfoResult"] = bookInfoResult;
            res.json(returnParams);        
        });        
    }else{
        getBookLast(function(bookInfoResult){
            returnParams["bookInfoResult"] = bookInfoResult;
            res.json(returnParams);        
        });             
    }
});

//書籍のリクエスト実行
app.post('/requestBook', (req, res) => {
    res.header('Content-Type', 'text/plain;charset=utf-8');
    //post data
    var requestIsbn = req.body.isbn;

    //返却用
    var returnParams = {
        message:""
    };
    
    //sessionからaccountを取得
    if (req.session.account) {
        var account = req.session.account;
    } else {
        returnParams.message = "正しいaccountから実行してください" ;
        res.json(returnParams); 
    }
    

    //同じISBNへの未実行リクエストがある場合は登録しない
    getTrnListByStatus(account,STATUS_UPLOADED,function(trnResult){
        var flg = 0 ;
        trnResult.forEach(function(element){
            if(element.type == TRN_TYPE_REQUEST && element.isbn == requestIsbn ){
                flg = 1;
            }
        });
        if(flg){
            returnParams.message = "既にリクエスト済の書籍です" ;
            res.json(returnParams); 
        }else{
            //同じISBNに未実行のリクエストがなければリクエストを登録
            var trnInfo = {} ;
            trnInfo.account = account ;
            trnInfo.isbn = requestIsbn ;
            trnInfo.type = TRN_TYPE_REQUEST ;
            insertTrnInfo(trnInfo,function(result){
                returnParams.message = "リクエストしました";
                res.json(returnParams); 
            });        
        }
    });
});

//バーコードから書籍検索
app.get('/searchBookByIsbn', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //getパラメータを分割してgetParamsにセット
    var getParams = queryStringFromZxing(req);

    res.header('Content-Type', 'text/plain;charset=utf-8');
    //パラメータを設定してejsをレンダリング
    //zxingからの戻りは、&が使えないので!をデリミタとして利用

    //ejsに渡す用のパラメータをセットしてく
    var ejsParams = {};

    ejsParams["account"] = getParams["account"];
    req.session.account = ejsParams["account"];    
    ejsParams["isbn"] = getParams["jancode"];
    ejsParams["searchKey"] = ejsParams["isbn"] ;
    ejsParams["filename"] = "filename";
    ejsParams["zxingParam"] = "ret=http://irbookp2p-env.prw2xfpatf.us-east-2.elasticbeanstalk.com/searchBookByIsbn/?params=account=" 
        + ejsParams["account"]
        + "!jancode={CODE}" ;    
    //navbar用
    ejsParams["navActive"] = "/searchBook";
    
    getBookByIsbnList([ejsParams["isbn"]], function (bookInfoResult) {
        ejsParams["book_list"] = bookInfoResult;
        ejsParams["book_list.length"] = Object.keys(ejsParams["book_list"]).length ;
        fs.readFile('./views/searchBook.ejs', 'utf-8', function (err, data) {
            renderEjsView(res, data, ejsParams);
        });
    });
});

//書籍実物確認
app.get('/checkBook', (req, res) => {
    res.header('Content-Type', 'text/plain;charset=utf-8');
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //getパラメータを分割してgetParamsにセット
    var getParams = queryStringFromZxing(req);

    var ejsParams = {};

    //sessionからaccountを取得
    if (getParams["account"]) {
        ejsParams["account"] = getParams["account"];
        req.session.account = ejsParams["account"];
    } else if (req.session.account) {
        ejsParams["account"] = req.session.account;
    } else {
        ejsParams["account"] = "";
    }
    
    //登録用TrnInfo
    var trnInfo = {} ;
    trnInfo.account = ejsParams["account"] ;

    //パラメータによって、isbn,TYPE等を取得
    if(!getParams["type"]){
        ejsParams["isbn"] = ""
        ejsParams["typeStr"] = "no data";        
    }else if(getParams["type"] == TRN_TYPE_RENTAL_START ){
        //取引開始＝借りる書籍の受け取り
        trnInfo.isbn = getParams["jancode"] ;
        trnInfo.type = TRN_TYPE_RENTAL_START
        ejsParams["isbn"] = getParams["jancode"] ;
        ejsParams["typeStr"] = TRN_TYPE_RENTAL_START_STR ;

    }else if (getParams["type"] == TRN_TYPE_RENTAL_END){
        trnInfo.isbn = getParams["jancode"] ;
        trnInfo.type = TRN_TYPE_RENTAL_END
        ejsParams["isbn"] = getParams["jancode"] ;
        ejsParams["typeStr"] = TRN_TYPE_RENTAL_END_STR ;
    }
    
    //パラメータの設定    
    ejsParams["statusStr"] = STATUS_UPLOADED_STR;
    ejsParams["filename"] = "filename";
    ejsParams["book_list"] = {};
    ejsParams["book_list.length"] = 0;
    ejsParams["id"] = 0;
    ejsParams["zxingParamStart"] = "ret=http://irbookp2p-env.prw2xfpatf.us-east-2.elasticbeanstalk.com/checkBook/?params=type="
        + TRN_TYPE_RENTAL_START
        + "!account=" 
        + ejsParams["account"]
        + "!jancode={CODE}" ;
    ejsParams["zxingParamEnd"] = "ret=http://irbookp2p-env.prw2xfpatf.us-east-2.elasticbeanstalk.com/checkBook/?params=type="
        + TRN_TYPE_RENTAL_END
        + "!account=" 
        + ejsParams["account"]
        + "!jancode={CODE}" ;
    //navbar用
    ejsParams["navActive"] = "/checkBook";
    //toastr用
    ejsParams["toastrStr"] = "" ;

    if (ejsParams["account"] == "") {
        fs.readFile('./views/noaccount.ejs', 'utf-8', function (err, data) {
            renderEjsView(res, data, ejsParams);
        });
    } else {
        //登録済みのトランザクションを取得する
        getTrnList(ejsParams["account"],function(resultTrnList){
            ejsParams["trn_list"] = convertTrnList(resultTrnList) ;
            ejsParams["trn_list.length"] = Object.keys(ejsParams["trn_list"]).length ;
    
            //トランザクションの登録
            if(ejsParams["isbn"] !== ""){
                //同じISBNに対して未登録のトランザクションがあればエラー
                //同じISBNへの未登録トランザクションのチェック
                var flg = 0 ;
                resultTrnList.forEach(function(element){
                    if(element.status == STATUS_UPLOADED && element.isbn == ejsParams["isbn"] ){
                        flg = 1;
                    }  
                });

                if(flg){
                    ejsParams["toastrStr"] = "同じ書籍に登録中の取引があるためこの書籍は登録されません"
                    fs.readFile('./views/checkBook.ejs', 'utf-8', function (err, data) {
                       renderEjsView(res, data, ejsParams);
                    });                                                        
                }else{
                    ejsParams["toastrStr"] = "取引を登録しました"
                    insertTrnInfo(trnInfo,function(insertResult){
                        fs.readFile('./views/checkBook.ejs', 'utf-8', function (err, data) {
                           renderEjsView(res, data, ejsParams);
                        });                                    
                    });                    
                }
                
            }else{
                fs.readFile('./views/checkBook.ejs', 'utf-8', function (err, data) {
                   renderEjsView(res, data, ejsParams);
                });                                    
                
            }
        });        
    }
});


//一覧処理のget処理
app.get('/', (req, res) => {
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);

    //getパラメータを分割してgetParamsにセット
    var getParams = queryStringFromZxing(req);

    res.header('Content-Type', 'text/plain;charset=utf-8');
    //パラメータを設定してejsをレンダリング
    //ejsに渡す用のパラメータをセットしてく
    var ejsParams = {};

    //accountの設定 session or getParams
    //sessionからaccountを取得
    if (getParams["account"]) {
        ejsParams["account"] = getParams["account"];
    } else if (req.session.account) {
        ejsParams["account"] = req.session.account;
    } else {
        ejsParams["account"] = null;
    }
    ejsParams["isbn"] = getParams["jancode"] || "";
    ejsParams["book_list"] = {};
    ejsParams["title"] = "no data";
    ejsParams["author"] = "no data";
    ejsParams["description"] = "no data";
    ejsParams["id"] = 0;
    ejsParams["zxingParam"] = "ret=http://irbookp2p-env.prw2xfpatf.us-east-2.elasticbeanstalk.com/?params=account=" 
        + ejsParams["account"]
        + "!jancode={CODE}";
    //express4でejsテンプレートを読み込むための呪文
    ejsParams["filename"] = "filename";
    //navbar用
    ejsParams["navActive"] = "/";
    ejsParams["toastrStr"] = ""

    //accountがguestの場合は別の画面に誘導。それ以外の場合は、当該accountの登録済み書籍を取得
    if (ejsParams["account"] == null) {
        fs.readFile('./views/noaccount.ejs', 'utf-8', function (err, data) {
            renderEjsView(res, data, ejsParams);
        });

    } else {

        //accountをsessionに登録する
        req.session.account = ejsParams["account"];

        //登録済み書籍を取得し、次の処理に渡す（callback)
        getBookListByAccount(ejsParams["account"], function (result) {

            //DBからの一覧取得結果を格納
            if (result) {
                ejsParams["book_list"] = result;
                ejsParams["book_list.length"] = Object.keys(ejsParams["book_list"]).length;
            }

            //jancode=isbnがgetパラメータに含まれる場合はgoogle book api経由でレンディングする
            if (ejsParams["isbn"]=="") {
                //ejsにパラメータを渡しつつ、viewをレンディング
                fs.readFile('./views/zxingUI.ejs', 'utf-8', function (err, data) {
                    renderEjsView(res, data, ejsParams);

                });
            } else {
                //google book api経由
                getGoogleBookInfoByIsbn(ejsParams["isbn"], function (googleBooksInfo) {
                    //google book apiから少なくともタイトルが取得できたら、DB登録しつつ表示する書籍情報を更新
                    if (googleBooksInfo.title) {
                        //DB登録
                        var bookInfo = {};
                        bookInfo.account = ejsParams["account"];
                        bookInfo.isbn = ejsParams["isbn"];
                        bookInfo.title = googleBooksInfo.title;
                        bookInfo.author = googleBooksInfo.author;
                        bookInfo.description = googleBooksInfo.description;

                        insertBookInfo(bookInfo, function (result) {
                            //表示する書籍情報の更新
                            ejsParams["title"] = bookInfo.title;
                            ejsParams["author"] = bookInfo.author;
                            ejsParams["description"] = bookInfo.description;

                            //insert時のincrement id を取得
                            ejsParams["id"] = result.insertId;

                            //レンダリング
                            fs.readFile('./views/zxingUI.ejs', 'utf-8', function (err, data) {
                                renderEjsView(res, data, ejsParams);

                            });
                        });
                    }
                    //google books apiからタイトルが取得できなかったら、登録画面に強制的に飛ばす
                    else {
                        //レンダリング
                        fs.readFile('./views/registerBook.ejs', 'utf-8', function (err, data) {
                            renderEjsView(res, data, ejsParams);
                        });

                    }
                });
            }
        });
    }

});

//キーワードから書籍検索
function searchBookByKey(searchKey,mode,callback){
    var tempParams = {} ;
    tempParams["searchIsbnList"] = [];
    
    //Google Booksからタイトル検索する
    getGoogleBookInfoByTitle(searchKey, function (googleResultByTitle) {
        //タイトルによる検索結果ISBN Listをマージする
        /*ISBN形式(13桁のの場合はデータベースから検索
          それ以外の場合はGoogle Books APIに問い合わせるてISBNのリストを取得する
         */
        //ISBN形式の場合は、そのままリストに登録
        if (searchKey.match("[0-9]{13}")) {
            tempParams["searchIsbnList"].push(searchKey);
        }
        //配列のマージ
        Array.prototype.push.apply(tempParams["searchIsbnList"], googleResultByTitle);
        //重複排除
        tempParams["searchIsbnList"] = tempParams["searchIsbnList"].filter(function (x, i, self) {
            return self.indexOf(x) === i;
        });

        getGoogleBookInfoByKey(searchKey, function (googleResultByKey) {
            //配列のマージ
            Array.prototype.push.apply(tempParams["searchIsbnList"], googleResultByKey);
            //重複排除
            tempParams["searchIsbnList"] = tempParams["searchIsbnList"].filter(function (x, i, self) {
                return self.indexOf(x) === i;
            });

            //DBにキーワード問い合わせ
            searchBookIsbnByKey(searchKey, function (searchIsbnByKeyResult) {
                //DBからの取得は連想配列になっているので、forぶんで結合処理
                searchIsbnByKeyResult.forEach(function (element) {
                    tempParams["searchIsbnList"].push(element.isbn);
                });
                //重複排除
                tempParams["searchIsbnList"] = tempParams["searchIsbnList"].filter(function (x, i, self) {
                    return self.indexOf(x) === i;
                });
                if(mode == SEARCH_MODE_ISBN){
                    getExistIsbnList(tempParams["searchIsbnList"], function (bookInfoResult) {
                        callback(bookInfoResult);
                    });                    
                }else{
                    //DBにISBN問い合わせ
                    getBookByIsbnList(tempParams["searchIsbnList"], function (bookInfoResult) {
                        callback(bookInfoResult);
                    });                    
                }
            });

        })

    });

}

//zxing経由のgetリクエストからクエリストリングを処理
function queryStringFromZxing(req){
    //zxing経由でのgetリクエストの場合、デリミタが!になる
    //getパラメータを取得
    var url_parts = url.parse(req.url, true);
    var params;
    var getParams = {};
    if (url_parts.query.params) {
        params = url_parts.query.params.split(ZXING_QUERYSTRING_DELIM);
        params.forEach(function (element) {
            //パラメータのラベルと値を分離
            var p = element.split("=");
            getParams[p[0]] = p[1];
        });
    }
    return getParams ;
}

//ejsにパラメータを渡しつつview1をレンディングする
function renderEjsView(res, data, ejsParams) {
    var view = ejs.render(data, ejsParams);
    res.writeHead(200, {
        'Content-Type': 'text/html'
    });
    res.write(view);
    res.end();
}
//特定のidを持つ書籍を取得する
function getBookById(id, callback) {
    //accountがあれば、検索
    if (id !== 0) {
        //書籍情報取得(ステータス0=upload済みを取得)
        connection.query("select isbn,title,author,description,status from book_list where id = ? ", [id],
            function (error, results, fields) {
                if (error !== null) {
                    console.log(error);
                }
                callback(results);
            });
    } else {
        return null;
    }
}
//特定のisbnを持つ書籍を取得する
function getBookByIsbnList(searchIsbnList, callback) {
    //accountがあれば、検索
    if (searchIsbnList) {
        //書籍情報取得(ステータス0=upload済みを取得)
        var query = "select id,isbn,title,author,description,status from book_list where isbn in (";
        //バインドするパラメータを配列の長さぶん追加する
        for (var i = 1; i <= searchIsbnList.length; i++) {
            if (i == searchIsbnList.length) {
                query = query + "?) order by modified_date desc";
            } else {
                query = query + "?,"
            }
        }
        connection.query(query,
            searchIsbnList,
            function (error, results, fields) {
                if (error !== null) {
                    console.log(error);
                }
                callback(results);
            });
    } else {
        return null;
    }
}

//特定のisbnを持つ書籍のisbnを取得する
function getExistIsbnList(searchIsbnList, callback) {
    //accountがあれば、検索
    if (searchIsbnList) {
        //書籍情報取得(ステータス0=upload済みを取得)
        var query = "select isbn from book_list where isbn in (";
        //バインドするパラメータを配列の長さぶん追加する
        for (var i = 1; i <= searchIsbnList.length; i++) {
            if (i == searchIsbnList.length) {
                query = query + "?) order by modified_date desc";
            } else {
                query = query + "?,"
            }
        }
        connection.query(query,
            searchIsbnList,
            function (error, results, fields) {
                if (error !== null) {
                    console.log(error);
                }
                callback(results);
            });
    } else {
        return null;
    }
}

//検索キーから書籍情報を取得する
function searchBookIsbnByKey(searchKey, callback) {
    //keyがあれば、検索
    if (searchKey) {
        connection.query("select isbn from book_list where title like ? or description like ?", ["%" + searchKey + "%", "%" + searchKey + "%"],
            function (error, results, fields) {
                if (error !== null) {
                    console.log(error);
                }
                callback(results);
            });
    } else {
        return null;
    }
}
//最新の書籍情報を取得する
function getBookLast(callback) {
    //書籍情報取得(最新？件のステータス0=upload済みを取得)
    connection.query("select id,isbn,title,author,description,status from book_list where status = ? order by status desc,modified_date desc limit ? ", [STATUS_ADDED,MAX_SEARCH_SIZE],
        function (error, results, fields) {
            if (error !== null) {
                console.log(error);
            }
            callback(results);
        });
}
//最新のISBNリストを取得する
function getBookIsbnLast(callback) {
    //書籍情報取得(最新？件のステータス0=upload済みを取得)
    connection.query("select t1.isbn from (select isbn,max(modified_date) as modified_date from book_list where status = ?  group by isbn order by modified_date desc limit ? ) t1 ", [STATUS_ADDED,MAX_SEARCH_SIZE],
        function (error, results, fields) {
            if (error !== null) {
                console.log(error);
            }
            callback(results);
        });
}

//特定のidをもつ書籍情報を更新する
function updateBookById(updateBook, callback) {
    //ステータス更新
    connection.query("update book_list set isbn = ?,title = ?,author = ?,description = ?,status = ?,modified_date=CURRENT_TIME where id = ?", [updateBook.isbn,
     updateBook.title.slice(0, 50),
     updateBook.author.slice(0, 25),
     updateBook.description.slice(0, 100),
     updateBook.status,
     updateBook.id],
        function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            if (callback) {
                callback(results);
            }
        });
}

//特定のidをもつ書籍情報を論理削除する
function deleteBookById(id, callback) {
    //ステータス更新
    connection.query("update book_list set status = ? where id = ?", 
    [STATUS_DELETE_UPLOADED,
     id],
        function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            if (callback) {
                callback(results);
            }
        });
}


//特定アカウントの書籍のステータスを一括更新する
function updateBookStatusByAccount(account, fromStatus, toStatus, callback) {
    //ステータス更新
    connection.query("update book_list set status = ? where account = ? and status = ?", [toStatus, account, fromStatus],
        function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            if (callback) {
                callback();
            }
        });
}
//特定アカウント・ISBNの書籍のステータスを一括更新する
function updateBookStatusByAccountIsbn(account, isbn, fromStatus, toStatus, callback) {
    //ステータス更新
    connection.query("update book_list set status = ? where account = ? and isbn = ? and status = ?", [toStatus, account, isbn ,fromStatus],
        function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            if (callback) {
                callback({"result":"true"});
            }
        });
}

//書籍情報を登録する
function insertBookInfo(bookInfo, callback) {
    if (checkBookInfo(bookInfo)) {
        connection.query("insert into book_list (account,isbn,title,author,modified_date,status,description) values (?,?,?,?,CURRENT_TIME,0,?)", [
			bookInfo.account,
			bookInfo.isbn,
			bookInfo.title.slice(0, 50),
			bookInfo.author.slice(0, 25),
            bookInfo.description.slice(0, 100)
		]

            ,
            function (error, results, fields) {
                if (error) {
                    console.log(error);
                }
                if (callback) {
                    callback(results);
                }
            });
    }
}

//書籍情報の必須項目バリデーション
function checkBookInfo(bookInfo) {
    return bookInfo.account && bookInfo.isbn && bookInfo.title;
}

//取引情報の必須項目バリデーション
function checkTrnInfo(trnInfo) {
    return trnInfo.account && trnInfo.isbn && trnInfo.type ;
}

//追加用取引リストの取得
function getTrnListByStatus(account,status, callback) {
    //accountがあれば、検索
    if (account !== null) {
        //書籍情報取得(ステータス0=upload済みを取得)
        connection.query("select id,account,isbn,type,status from trn_list where account = ? and status = ? order by id desc"
            , [account, status],
            function (error, results, fields) {
                if (error !== null) {
                    console.log(error);
                }
                callback(results);
            });
    } else {
        return null;
    }
}

//特定アカウントの取引のステータスを一括更新する
function updateTrnStatusByAccount(account, fromStatus, toStatus, callback) {
    //ステータス更新
    connection.query("update trn_list set status = ? where account = ? and status = ?", [toStatus, account, fromStatus],
        function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            if (callback) {
                callback({"result":"true"});
            }
        });
}

//特定アカウント、ISBNの取引のステータスを一括更新する
function updateTrnStatusByAccountIsbnType(account, isbn, type, fromStatus, toStatus, callback) {
    //ステータス更新
    connection.query("update trn_list set status = ? where account = ? and isbn = ? and type = ? and status = ?", [toStatus, account,isbn,type, fromStatus],
        function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            if (callback) {
                callback();
            }
        });
}


//取引情報を登録する
function insertTrnInfo(trnInfo, callback) {
    if (checkTrnInfo(trnInfo)) {
        connection.query("insert into trn_list (account,isbn,type,status) values (?,?,?,0)", [
			trnInfo.account,
			trnInfo.isbn,
            trnInfo.type
		] ,
            function (error, results, fields) {
                if (error) {
                    console.log(error);
                }
                if (callback) {
                    callback(results);
                }
            });
    }
}

//特定アカウントの書籍情報リストの取得
function getBookListByAccount(account,callback) {
    //accountがあれば、検索
    if (account !== null) {
        //書籍情報取得(ステータス0=upload済みを取得)
        connection.query("select id,account,isbn,title,author,description,status from book_list where account = ? order by modified_date desc", [account],
            function (error, results, fields) {
                if (error !== null) {
                    console.log(error);
                }
                callback(results);
            });
    } else {
        return null;
    }
}

//特定ステータスの書籍情報リストの取得
function getBookListByStatus(account,status, callback) {
    //accountがあれば、検索
    if (account !== null) {
        //書籍情報取得(ステータス0=upload済みを取得)
        connection.query("select id,account,isbn,title,author,description,status from book_list where account = ? and status = ? order by modified_date desc", [account, status],
            function (error, results, fields) {
                if (error !== null) {
                    console.log(error);
                }
                callback(results);
            });
    } else {
        return null;
    }
}

//取引情報リストの取得
function getTrnList(account, callback) {
    //accountがあれば、検索
    if (account !== null) {
        //書籍情報取得(ステータス0=upload済みを取得)
        connection.query("select id,account,isbn,type,status from trn_list where account = ? order by status asc, id desc", [account],
            function (error, results, fields) {
                if (error !== null) {
                    console.log(error);
                }
                callback(results);
            });
    } else {
        return null;
    }
}
//取引情報の項目を論理値にする
function convertTrnList(trnList){
    trnList.forEach(function(element,i){
        //typeの変換
        if(element.type == TRN_TYPE_REQUEST){
            element.typeStr = TRN_TYPE_REQUEST_STR ;
        }else if(element.type == TRN_TYPE_RENTAL_START){
            element.typeStr = TRN_TYPE_RENTAL_START_STR ;
        }else if(element.type == TRN_TYPE_RENTAL_END){
            element.typeStr = TRN_TYPE_RENTAL_END_STR ;
        }
        //statusの変換
        if(element.status == STATUS_UPLOADED){
            element.statusStr = STATUS_UPLOADED_STR ;
        }else if(element.status == STATUS_ADDED){
            element.statusStr = STATUS_ADDED_STR ;
        }        
        
    }) ;
    return trnList ;
}

//google からisbnを元に書籍情報を取得
function getGoogleBookInfoByIsbn(isbn, callback) {
    if (isbn.trim()) {
        var url = "https://www.googleapis.com/books/v1/volumes?q=isbn:" + querystring.escape(isbn);

        //google book api にgetリクエスト
        https.get(url, (res) => {
            var body = '';
            res.setEncoding('utf8');

            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', (res) => {
                //resにデータ本文を格納
                res = JSON.parse(body);

                //書籍情報をセット
                var googleBooksInfo = {};
                googleBooksInfo.title = "";
                googleBooksInfo.author = "";
                googleBooksInfo.description = "";

                //google books apiは、ものによってパラメータが取れない
                try {
                    if (res.items[0].volumeInfo.title) {
                        googleBooksInfo.title = res.items[0].volumeInfo.title;
                    }
                    if (res.items[0].volumeInfo.authors) {
                        googleBooksInfo.author = res.items[0].volumeInfo.authors[0];
                    }
                    //google books apiで、descriptionが追加されたので、取得
                    if (res.items[0].volumeInfo.description) {
                        googleBooksInfo.description = res.items[0].volumeInfo.description;
                    }
                    callback(googleBooksInfo);
                } catch (e) {
                    callback(googleBooksInfo);
                }

            });
        }).on('error', (e) => {
            console.log(e.message); //エラー時
        });
    }
}
//google からタイトル等を元に書籍情報を取得
function getGoogleBookInfoByTitle(searchKey, callback) {
    if (searchKey.trim()) {
        var urlByTitle = "https://www.googleapis.com/books/v1/volumes?q=" + querystring.escape("intitle:" + searchKey);
        //		var urlByTitle = "https://www.googleapis.com/books/v1/volumes?maxResults=10&q=intitle:" + searchKey ;

        //isbn list
        var isbnList = [];

        //google book api にgetリクエスト
        https.get(urlByTitle, (res) => {
            var body = '';
            res.setEncoding('utf8');

            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', (res) => {
                //resにデータ本文を格納
                res = JSON.parse(body);

                //google books apiは、ものによってパラメータが取れない
                if (res.totalItems != 0) {
                    res.items.forEach(function (element) {
                        try {
                            if ("industryIdentifiers" in element.volumeInfo) {
                                element.volumeInfo.industryIdentifiers.forEach(function (obj) {
                                    if (obj.type == "ISBN_13") {
                                        isbnList.push(obj.identifier);
                                    }
                                });
                            }
                        } catch (e) {
                            console.log(e);
                            callback(isbnList);
                        }
                    });
                }
                callback(isbnList);
            });
        }).on('error', (e) => {
            console.log(e.message); //エラー時
        });
    }
}

//google からタイトル等を元に書籍情報を取得
function getGoogleBookInfoByKey(searchKey, callback) {
    if (searchKey.trim()) {
        var urlByKey = "https://www.googleapis.com/books/v1/volumes?q=" + querystring.escape(searchKey);
        //		var urlByKey = "https://www.googleapis.com/books/v1/volumes?maxResults=10&q=" + searchKey ;

        //isbn list
        var isbnList = [];

        //google book api にgetリクエスト
        https.get(urlByKey, (res) => {
            var body = '';
            res.setEncoding('utf8');

            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', (res) => {
                //resにデータ本文を格納
                res = JSON.parse(body);

                //google books apiは、ものによってパラメータが取れない
                if (res.totalItems != 0) {
                    res.items.forEach(function (element) {
                        try {
                            if ("industryIdentifiers" in element.volumeInfo) {
                                element.volumeInfo.industryIdentifiers.forEach(function (obj) {
                                    if (obj.type == "ISBN_13") {
                                        isbnList.push(obj.identifier);
                                    }
                                });
                            }
                        } catch (e) {
                            console.log(e);
                            callback(isbnList);
                        }
                    });
                }
                callback(isbnList);
            });
        }).on('error', (e) => {
            console.log(e.message); //エラー時
        });
    }
}


if (module === require.main) {
    // [START server]
    // Start the server
    const server = app.listen(process.env.PORT || 8081, () => {
        const port = server.address().port;
        console.log(`App listening on port ${port}`);
    });
    // [END server]
}

module.exports = app;
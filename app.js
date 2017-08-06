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
const app = express();
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/views'));

const url = require('url') ;
const ejs = require('ejs') ;
const jquery = require('jquery');
const https = require('https') ;
const fs = require('fs');
var config = require('config') ;

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

const connection = mysql.createConnection(options);

//データ処理用のget処理
app.get('/addBook/', (req, res) => {
	//getパラメータを取得
	var url_parts = url.parse(req.url,true);

	//パラメータからaccountを取得
	if(url_parts.query.account){
		var account = url_parts.query.account ;	
	}else{
		account = "" ;
	}
	
	//書籍追加用の情報を取得
	getBookList(account,
		function(dbRes){
			//書籍を追加済みのステータスにする
			updateBookStatus(account, "0", "1",null) ;
			//取得した書籍情報をJSONとしてレンディング
			var json = JSON.stringify(dbRes);
			res.header('Content-Type', 'text/plain;charset=utf-8');
			res.header('Access-Control-Allow-Origin','*') ;
			res.write(json);
			res.end();
		}
	) ;	
	
});
//indexのget処理
app.get('/', (req, res) => {
	//getパラメータを取得
	var url_parts = url.parse(req.url,true);
	
	//getパラメータを分割してgetParamsにセット
	var params ;
	var getParams = {} ;
	if(url_parts.query.params){
		params = url_parts.query.params.split("!") ;
		params.forEach(function(element){
			//パラメータのラベルと値を分離
			var p = element.split("=") ;
			getParams[p[0]] = p[1] ;
		});
	}	

	//パラメータを設定してejsをレンダリング
	//zxingからの戻りは、&が使えないので!をデリミタとして利用
	fs.readFile('./views/zxingUI.ejs', 'utf-8',function (err, data) {
		//ejsに渡す用のパラメータをセットしてく
		var ejsParams = {} ;
		
		ejsParams["account"] = getParams["account"] || "guest" ;
		ejsParams["isbn"] = getParams["jancode"] || "no data" ;
		ejsParams["book_list"] = {};
		ejsParams["title"] = "no data" ;
		ejsParams["author"] = "no data" ;
		ejsParams["filename"] = "filename" ;
		
		//accountがguestの場合は別の画面に誘導。それ以外の場合は、当該accountの登録済み書籍を取得
		if(getParams["account"] == null){
			fs.readFile('./views/noaccount.ejs', 'utf-8',function (err, data) {
				renderEjsView(res,data,ejsParams) ;
			});

		}else{
			
			//登録済み書籍を取得し、次の処理に渡す（callback)
			getBookList(getParams["account"],function(result){
			
				//DBからの一覧取得結果を格納
				ejsParams["book_list"] = result ;
				ejsParams["book_list.length"] = Object.keys(ejsParams["book_list"]).length ;
				
				//jancode=isbnがgetパラメータに含まれる場合はgoogle book api経由でレンディングする
				if(!getParams["jancode"]){
					//ejsにパラメータを渡しつつ、viewをレンディング
					renderEjsView(res,data,ejsParams) ;	
				}else{
					//google book api経由
					getGoogleBookInfo(getParams["jancode"],function(googleRes){
						//google book apiから書籍情報が取得できたら、DB登録しつつ表示する書籍情報を更新
						if(googleRes.totalItems == 1){
							//DB登録
							var bookInfo = {};
							bookInfo.account = getParams["account"] ;
							bookInfo.isbn = getParams["jancode"] ;
							bookInfo.title = googleRes.items[0].volumeInfo.title ;
							bookInfo.author = googleRes.items[0].volumeInfo.authors[0] ;
		
							insertBookInfo(bookInfo) ;
							
							//表示する書籍情報の更新
							ejsParams["title"] = bookInfo.title ;
							ejsParams["author"] = bookInfo.author ;	
										
						}
						renderEjsView(res,data,ejsParams) ;
					}) ;
				}
			}) ;
		}

	});		

});

//ejsにパラメータを渡しつつview1をレンディングする
function renderEjsView(res,data,ejsParams){
	var view = ejs.render(data,ejsParams);	
	res.writeHead(200, {'Content-Type': 'text/html'});
	res.write(view);
	res.end();
}

//書籍のステータスを更新する
function updateBookStatus(account,fromStatus,toStatus,callback){
	//ステータス更新
	connection.query("update book_list set status = ? where account = ? and status = ?",
	[toStatus,account,fromStatus],
	function (error, results, fields) {
			if(error){
				console.log(error) ;	
			}
			if(callback){
				callback ;
			} 
		}) ;
}

//書籍情報を登録する
function insertBookInfo(bookInfo){
	if(checkBookInfo(bookInfo)){
		connection.query("insert into book_list (account,isbn,title,author,modified_date,status) values (?,?,?,?,CURRENT_TIME,0)",
		[
			bookInfo.account,
			bookInfo.isbn,
			bookInfo.title,
			bookInfo.author
		]

		,function (error, results, fields) {
			if(error){
				console.log(error) ;	
			}
		}) ;
	}
}

//書籍情報のバリデーション
function checkBookInfo(bookInfo){
	return bookInfo.account && bookInfo.isbn && bookInfo.title && bookInfo.author ;
}

//追加用書籍情報リストの取得
function getBookList(account,callback){
	//accountがあれば、検索
	if(account !== null){
		//書籍情報取得(ステータス0=upload済みを取得)
		connection.query("select account,isbn,title,author from book_list where account = ? and status = ? order by modified_date desc",
		[account,"0"],
		function (error, results, fields) {
			if(error !== null){
				console.log(error) ;				
			}
			callback(results) ;
		}) ;
	}else{
		return null ;	
	}
}

//google からisbnを元に書籍情報を取得
function getGoogleBookInfo(isbn,callback){
	if(isbn !== null){
		var url = "https://www.googleapis.com/books/v1/volumes?q=isbn:" + isbn ;
		console.log("google books api:" + url);
		
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
		      
		      //google Books APIのresponseを元にコールバック
		      callback(res) ;
		     
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

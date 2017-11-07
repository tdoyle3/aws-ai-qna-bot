/*
Copyright 2017-2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Amazon Software License (the "License"). You may not use this file
except in compliance with the License. A copy of the License is located at

http://aws.amazon.com/asl/

or in the "license" file accompanying this file. This file is distributed on an "AS IS"
BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the
License for the specific language governing permissions and limitations under the License.
*/

const replaceTxt = ' '

function matchTitle(msg){
  return msg.match(/\[([^\]]*)]/gm)
}

function matchLink(msg){
  return msg.match(/(?:https?|ftp):\/\/[\n\S]+/g)
}

function replaceLink(msg){
  return msg.replace(/(?:https?|ftp):\/\/[\n\S]+/g, replaceTxt)
}

function matchMDLink(msg){
  return msg.match(/\[([^\]]*)]\((?:https?|ftp):\/\/[\S]+(?=\))/gm)
}

function replaceMDLink(msg){
  return msg.replace(/\[([^\]]*)]\((?:https?|ftp):[^)]*\)/gm, replaceTxt)
}

function parseLinks(msg){
  const res = {}
  let mlink=[]
  if (process.env.SKIP_LINK_PARSING && process.env.SKIP_LINK_PARSING==='TRUE') {
    res.orig = msg
    res.text = msg
    res.mlink = mlink
    return res
  }
  const mlink2 = matchMDLink(msg)
  const revised = replaceMDLink(msg)
  const mlink1 = matchLink(revised)

  let i=0
  if (mlink1 && mlink1.length>0) {
    for (i = 0; i < mlink1.length; i++) {
      const obj = {
        "title": "Additional Information",
        "attachmentLinkUrl": mlink1[i]
      }
      mlink[mlink.length] = obj
    }
  }
  if (mlink2 && mlink2.length>0) {
    for (i = 0; i < mlink2.length; i++) {
      let t = matchTitle(mlink2[i])
      let url = matchLink(mlink2[i])
      let title = t[0].substr(1, t[0].length - 2)
      if (title.length>80) {
        title = title.substr(0,80)
      }
      const obj = {
        "title": title,
        "attachmentLinkUrl": url[0].substr(0, url[0].length)
      }
      mlink[mlink.length] = obj
    }
  }
  const rtext = replaceMDLink(msg)
  const ftext = replaceLink(rtext)
  res.orig = msg
  res.text = ftext
  res.mlink = mlink
  return res
}

function getplaintext(msg){
  //This function removes SSML tags

  msg = msg.replace(/<amazon:effect[^>]*>/g,'')
  msg = msg.replace(/<\/amazon:effect>/g,'')

  msg = msg.replace(/<audio[^>]*>/g,'')

  msg = msg.replace(/<break[^>]*>/g,'')

  msg = msg.replace(/<emphasis[^>]*>/g,'')
  msg = msg.replace(/<\/emphasis>/g,'')

  msg = msg.replace(/<p>/g,'')
  msg = msg.replace(/<\/p>/g,'')

  msg = msg.replace(/<phoneme[^>]*>/g,'')
  msg = msg.replace(/<\/phoneme>/g,'')

  msg = msg.replace(/<prosody[^>]*>/g,'')
  msg = msg.replace(/<\/prosody>/g,'')

  msg = msg.replace(/<s>/g,'')
  msg = msg.replace(/<\/s>/g,'')

  msg = msg.replace(/<say-as[^>]*>/g,'')
  msg = msg.replace(/<\/say-as>/g,'')

  msg = msg.replace(/<sub alias[^>]*>/g,'')
  msg = msg.replace(/<\/sub>/g,'')

  msg = msg.replace(/<w role[^>]*>/g,'')
  msg = msg.replace(/<\/w>/g,'')

  msg = msg.replace(/<speak>/g,'')
  msg = msg.replace(/<\/speak>/g,'')

  return msg
}

function fixIntuitPhrases(msg){
  // speak Lacerte correctly
  msg = msg.replace(/Lacerte/g,'<phoneme alphabet="ipa" ph="ləˈsɚt">Lacerte</phoneme>')

  // speak 4-digit tax form numbers correctly 
  msg = msg.replace(/ (\d\d)(\d\d)([^\d])/g," <sub alias=\"$1 $2\">$1$2</sub>$3")

  return msg
}

exports.error=function(err,params){
    console.log(err)
    if(process.env.TYPE="API"){
        return JSON.stringify({error:err})
    }else if(process.env.TYPE="ALEXA"){
        return {
          "version": "1.0",
          "sessionAttributes": params.Session,
          "response": {
              "outputSpeech": {
                  "type": "PlainText",
                  "text": process.env.ERRORMESSAGE
              },
              "shouldEndSession": true,
          }
      }

    }else{
        return {
            sessionAttributes: params.Session,
            dialogAction: {
                type: "Close",
                fulfillmentState:"Failed",
                message:{
                    contentType:"PlainText",
                    content:process.env.ERRORMESSAGE
                }
            }
        }
    }
}

exports.success=function(message,params){
    console.log(process.env.TYPE,message)
    if(process.env.TYPE==="API"){
        return message
    } else if(process.env.TYPE==="ALEXA"){
      const links = parseLinks(message.msg)
      let linkmsg=''
      if (links.mlink && links.mlink.length > 0) {
        for (let i=0; i<links.mlink.length; i++) {
          linkmsg += ' ' + links.mlink[i].attachmentLinkUrl
        }
      }
      links.text = fixIntuitPhrases(links.text)
      const plaintext = getplaintext(links.text)
      const out={
        "version": "1.0",
        "sessionAttributes":params.Session,
        "response": {
            "outputSpeech": {
                "type": "PlainText",
                "text": links.text
            },
            "shouldEndSession": false,
            card:{
              type: "Standard",
              title: message.question,
              text: plaintext + linkmsg
            }
        }
      }
      if(message.r && message.r.imageUrl){
          out.response.card.image={largeImageUrl:message.r.imageUrl}
      }
      if(message.r && message.r.title){
          out.response.card.title=message.r.title
      }

      if(plaintext !== links.text){
        out.response.outputSpeech.type="SSML"
        out.response.outputSpeech.ssml="<speak>"+links.text+"</speak>"
        out.response.outputSpeech.text=""
      }

      return out
    } else { //lex
      const links = parseLinks(message.msg)
      links.text = "<speak>"+fixIntuitPhrases(links.text)+"</speak>"
      const plaintext = getplaintext(links.text)
      var out = {
        sessionAttributes: params.Session,
        dialogAction: {
          type: "Close",
          fulfillmentState: "Fulfilled",
          message: {
            //contentType: "PlainText",
            contentType: "SSML",
            content: links.text
          }
        }
      }

      if (message.r &&
        Object.keys(message.r).length>0 &&
        Object.keys(message.r).map(x=>message.r[x].length>0).indexOf(false)===-1) {
        out['dialogAction']['responseCard'] = {
          "version": 1,
          "contentType": "application/vnd.amazonaws.card.generic",
          "genericAttachments": [
            message.r
          ]
        }
        if (links.mlink && links.mlink.length > 0) {
          for (let x = 0; x < links.mlink.length; x++) {
            const l = out['dialogAction']['responseCard']['genericAttachments'].length
            out['dialogAction']['responseCard']['genericAttachments'][l] = links.mlink[x]
          }
        }
        out['sessionAttributes']['appContext'] = JSON.stringify({
          responseCard: out.dialogAction.responseCard
        })
      } else if (links.mlink && links.mlink.length > 0) {
        out['dialogAction']['responseCard'] = {
          "version": 1,
          "contentType": "application/vnd.amazonaws.card.generic",
          "genericAttachments": [
          ]
        }
        for (let x=0; x<links.mlink.length; x++) {
          const l = out['dialogAction']['responseCard']['genericAttachments'].length
          out['dialogAction']['responseCard']['genericAttachments'][l] = links.mlink[x]
        }
        out['sessionAttributes']['appContext'] = JSON.stringify({
          responseCard: out.dialogAction.responseCard
        })
      }
        return out
    }
}


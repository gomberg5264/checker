'use strict';
const mongoose = require('mongoose');
const SingleItem = mongoose.model('SingleItem');
const Items = mongoose.model('Items');
const Deleted = mongoose.model('Deleted');

const puppeteer = require('puppeteer');
const cron = require('node-cron');

exports.get_all_items = (req, res) => {
  SingleItem.find({}, (err, items) => {
    if (err) {
      res.send({
        error: err,
        message: 'No items fround',
        code: 204
      });
    }
    res.send({
      message: 'All items returned',
      data: items,
      code: 200
    });
  });
};

exports.get_single_item = (req, res) => {
  let id = req.body.id;
  SingleItem.findById(id, (err, item) => {
    if (err) {
      res.send({
        error: err,
        message: "Couldn't find the requested item",
        code: 400
      });
    }
    res.send({
      message: 'Item found',
      data: item,
      code: 200
    });
  });
};

exports.first_scrape = (req, res) => {
  let url = req.body.url;
  scraper(url)
    .then(data => {
      if (data) {
        let newItem = new SingleItem({
          name: data.title,
          link: url,
          imgUrl: data.imgUrl,
          price: data.priceInt
        });
        newItem.save((err, item) => {
          if (err) {
            res.send({
              error: err,
              message: "Couldn't create item in database",
              code: 400
            });
          }
          let itemCollection = new Items({
            uid: item._id
          });
          itemCollection.save();
          res.status(201).json({
            message: 'Item found and saved in database',
            success: true,
            obj: item
          });
        });
      }
    })
    .catch(err => {
      res.send({
        err: err,
        msg: 'Error - something went wrong scraping the item'
      });
    });
};

exports.update_item = (req, res) => {
  let id = req.body.id;
  let updatePrice = cron_update_item(id);
  if (updatePrice) {
    res.send({
      success: true,
      message: 'Item updated successfully',
      data: updatePrice
    });
  }
};

exports.delete_item = (req, res) => {
  let id = req.body.id;
  SingleItem.findById(id, (err, document) => {
    if (err) {
      res.send({
        error: err,
        message: "Couldn't find the requested item",
        code: 400
      });
    }
    let newItem = new Deleted({
      item: document
    });
    newItem.save((err, item) => {
      if (err) {
        res.send({
          error: err,
          message: "Couldn't find the requested item",
          code: 400
        });
      }
    });
  });
  SingleItem.findByIdAndRemove(id, (err, success) => {
    if (err) {
      res.send({
        error: err,
        message: "Couldn't find the requested item",
        code: 400
      });
    }
    res.send({
      message: 'Item deleted from database',
      success: true,
      obj: success
    });
  });
};

let scraper = async url => {
  console.log('Accessing Amazon to fetch item data');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  console.log('Going to chosen URL');
  await page.goto(url);
  await page.waitFor(1000);
  console.log('At chosen page \n Starting scrape');
  const result = await page.evaluate(() => {
    let title = document.querySelector('#productTitle').innerText;
    let imgUrl = document.querySelector('#imgTagWrapperId > img').src;
    let priceStr = document.querySelector('#priceblock_ourprice').innerText;
    let priceInt = parseInt(priceStr.replace(/£/g, ''));
    return {
      title,
      imgUrl,
      priceInt
    };
  });
  browser.close();
  return result;
};

let cron_update_item = async id => {
  let itemId = id;
  await SingleItem.findById(itemId, (err, item) => {
    scraper(item.link)
      .then(data => {
        if (data) {
          let newObj = {
            tite: data.title,
            price: data.priceInt,
            date: Date.now().toString()
          };
          SingleItem.findOneAndUpdate(
            { _id: itemId },
            { $push: { pastPrices: newObj } },
            (err, result) => {
              if (err) {
                return {
                  success: false,
                  error: err
                };
              }
              return { result };
            }
          );
        }
      })
      .catch(err => {
        return {
          success: false,
          message: 'Major error',
          error: err
        };
      });
  });
};

cron.schedule('1 * * * *', () => {
  console.log('Scraping item');
  cron_update_item('5d4ea96e597c8aa5e1912809');
});

/**
 * Puppeteer script written by following:
 * https://codeburst.io/a-guide-to-automating-scraping-the-web-with-javascript-chrome-puppeteer-node-js-b18efb9e9921
 */

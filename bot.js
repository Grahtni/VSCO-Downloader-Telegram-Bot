require("dotenv").config();
const { Bot, HttpError, GrammyError } = require("grammy");
const request = require("request");
const path = require("path");

// Bot

const bot = new Bot(process.env.BOT_TOKEN);

/// Response

async function responseTime(ctx, next) {
  const before = Date.now();
  await next();
  const after = Date.now();
  console.log(`Response time: ${after - before} ms`);
}

bot.use(responseTime);

// Commands

bot.command("start", async (ctx) => {
  await ctx
    .reply("*Welcome!* ✨\n_Send a VSCO link._", {
      parse_mode: "Markdown",
    })
    .then(console.log(`New user added:`, ctx.from))
    .catch((error) => console.error(error));
});

bot.command("help", async (ctx) => {
  await ctx
    .reply(
      "*@anzubo Project.*\n\n_This bot downloads posts from a VSCO.\nSend a link to try it out!_",
      { parse_mode: "Markdown" }
    )
    .then(console.log("Help command sent to", ctx.from.id))
    .catch((error) => console.error(error));
});

// Messages

bot.on("msg", async (ctx) => {
  // Logging

  const from = ctx.from;
  const name =
    from.last_name === undefined
      ? from.first_name
      : `${from.first_name} ${from.last_name}`;
  console.log(
    `From: ${name} (@${from.username}) ID: ${from.id}\nMessage: ${ctx.msg.text}`
  );

  // Logic

  if (ctx.msg.text.includes("vsco") && ctx.msg.text.includes("http")) {
    const statusMessage = await ctx.reply(`*Downloading*`, {
      parse_mode: "Markdown",
    });
    async function deleteMessageWithDelay(fromId, messageId, delayMs) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          bot.api
            .deleteMessage(fromId, messageId)
            .then(() => resolve())
            .catch((error) => reject(error));
        }, delayMs);
      });
    }
    await deleteMessageWithDelay(ctx.from.id, statusMessage.message_id, 3000);

    // Main

    try {
      async function getMediaUrl(postLink) {
        return new Promise((resolve, reject) => {
          const url = "https://api.iamtortue.com/vsco/";
          const data = {
            uri: postLink,
          };
          request.post({ url, form: data }, function (err, res, server_output) {
            if (err) {
              reject(err);
            }
            const parsed_output = JSON.parse(server_output);
            resolve(parsed_output.result);
          });
        });
      }

      async function handleReply(query) {
        if (!(await isValid(query))) {
          await ctx.reply("*Send a valid VSCO link.*", {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.msg.message_id,
          });
        } else {
          const data = await getMediaUrl(query);
          const mediaURL = data.image;
          const mediaType = await getMediaType(mediaURL);
          const postLink = await isValid(query);
          if (mediaType === undefined) {
            throw new Error("Undefined media type detected.");
          } else if (mediaType === "photo") {
            console.log("Photo sent");
            await ctx.replyWithPhoto(mediaURL, {
              caption: `<b><a href="${postLink}">${data.description}</a></b>\n<i>By</i> <a href="https://${data.profileLink}">${data.name}</a>`,
              parse_mode: "HTML",
              reply_to_message_id: ctx.msg.message_id,
            });
          } else if (mediaType === "video") {
            console.log("Video sent");
            await ctx.replyWithVideo(mediaURL, {
              caption: `<b><a href="${postLink}">${data.description}</a></b>\n<i>By</i> <a href="https://${data.profileLink}">${data.name}</a>`,
              parse_mode: "HTML",
              reply_to_message_id: ctx.msg.message_id,
            });
          }
        }
      }

      await handleReply(ctx.msg.text);

      async function isValid(text) {
        const vscoUrlRegex = /https:\/\/vsco\.co\/\w+\/media\/\w+/g;
        const urls = text.match(vscoUrlRegex);
        return urls;
      }

      async function getMediaType(downloadUrl) {
        const extension = path.extname(downloadUrl);
        if (
          extension === ".jpg" ||
          extension === ".jpeg" ||
          extension === ".png"
        ) {
          return "photo";
        } else if (
          extension === ".mp4" ||
          extension === ".mov" ||
          extension === ".gif"
        ) {
          return "video";
        } else {
          return undefined;
        }
      }
    } catch (error) {
      if (error instanceof GrammyError) {
        if (error.message.includes("Forbidden: bot was blocked by the user")) {
          console.log("Bot was blocked by the user");
        } else if (
          error.message.includes(
            "Call to 'sendVideo' failed!" || "Call to 'sendPhoto' failed!"
          )
        ) {
          console.log("Error sending media.");
          await ctx.reply(`*Error contacting VSCO.*`, {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.msg.message_id,
          });
        } else {
          await ctx.reply(`*An error occurred: ${error.message}*`, {
            parse_mode: "Markdown",
            reply_to_message_id: ctx.msg.message_id,
          });
        }
        console.log(`Error sending message: ${error.message}`);
        return;
      } else {
        console.log(`An error occured:`, error);
        await ctx.reply(
          `*An error occurred. Are you sure you sent a valid VSCO link?*\n_Error: ${error.message}_`,
          { parse_mode: "Markdown", reply_to_message_id: ctx.msg.message_id }
        );
        return;
      }
    }
  } else {
    await ctx.reply("*Send a valid VSCO link.*", {
      parse_mode: "Markdown",
      reply_to_message_id: ctx.msg.message_id,
    });
  }
});

// Error

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    "Error while handling update",
    ctx.update.update_id,
    "\nQuery:",
    ctx.msg.text
  );
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
    if (e.description === "Forbidden: bot was blocked by the user") {
      console.log("Bot was blocked by the user");
    } else {
      ctx.reply("An error occurred");
    }
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// Run

bot.start();

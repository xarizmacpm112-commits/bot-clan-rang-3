import { Telegraf } from 'telegraf';
import axios from 'axios';

async function login(email, password, url) {
  try {
    const res = await axios.post(url, { clientType: "CLIENT_TYPE_ANDROID", email, password, returnSecureToken: true }, 
    { headers: { "User-Agent": "Dalvik/2.1.0", "Content-Type": "application/json" } });
    return res?.data?.idToken || null;
  } catch (e) { return null; }
}

async function setRank(token, url) {
  const ratingData = {
    cars: 100000, car_fix: 100000, car_collided: 100000, car_exchange: 100000, 
    car_trade: 100000, car_wash: 100000, slicer_cut: 100000, drift_max: 100000, 
    drift: 100000, cargo: 100000, delivery: 100000, taxi: 100000, levels: 100000, 
    gifts: 100000, fuel: 100000, offroad: 100000, speed_banner: 100000, 
    reactions: 100000, police: 100000, run: 100000, real_estate: 100000, 
    t_distance: 100000, treasure: 100000, block_post: 100000, push_ups: 100000, 
    burnt_tire: 100000, passanger_distance: 100000, time: 10000000000, race_win: 3000
  };
  try {
    const res = await axios.post(url, { data: JSON.stringify({ RatingData: ratingData }) }, { 
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } 
    });
    return res.status === 200;
  } catch (e) { return false; }
}

export default {
  async scheduled(event, env, ctx) {
    const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
    const chatId = env.ADMIN_CHAT_ID;
    
    const allAccounts = await env.ACCOUNTS_KV.get("accounts_list", { type: "json" });
    if (!allAccounts || allAccounts.length === 0) return;

    const minute = new Date(event.scheduledTime).getUTCMinutes();
    let startIndex = 0;
    let name = "";

    if (minute === 0) { startIndex = 0; name = "PART 1 (20:00 МСК)"; }
    else if (minute === 5) { startIndex = 19; name = "PART 2 (20:05 МСК)"; }
    else if (minute === 10) { startIndex = 38; name = "PART 3 (20:10 МСК)"; }
    else if (minute === 15) { startIndex = 57; name = "PART 4 (20:15 МСК)"; }
    else if (minute === 20) { startIndex = 76; name = "PART 5 (20:20 МСК)"; }
    else if (minute === 25) { startIndex = 95; name = "PART 6 (20:25 МСК)"; }

    const accounts = allAccounts.slice(startIndex, startIndex + 19);

    if (accounts.length > 0) {
      await bot.telegram.sendMessage(chatId, `🚀 Запуск ${name}...`);
      let success = 0;
      for (const acc of accounts) {
        const token = await login(acc.email, acc.password, env.FIREBASE_LOGIN_URL);
        if (token && await setRank(token, env.RANK_URL)) {
          success++;
        } else {
          await bot.telegram.sendMessage(chatId, `❌ Ошибка на аккаунте: ${acc.email}`);
        }
      }
      const status = (success === accounts.length) ? "✅ Успешно" : `⚠️ Завершено с ошибками (${success}/${accounts.length})`;
      await bot.telegram.sendMessage(chatId, `${status} ${name}`);
    }
  },

  async fetch(request, env, ctx) {
    const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
    const ADMIN_ID = env.ADMIN_CHAT_ID.toString();

    bot.use(async (ctx, next) => {
      if (!ctx.chat || ctx.chat.id.toString() !== ADMIN_ID) {
        return;
      }
      return next();
    });

    bot.command('add', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 3) return ctx.reply('⚠️ Формат: /add email password');

      const email = args[1];
      const password = args[2];

      try {
        let allAccounts = await env.ACCOUNTS_KV.get("accounts_list", { type: "json" }) || [];
        if (allAccounts.some(acc => acc.email === email)) {
          return ctx.reply(`⚠️ Аккаунт ${email} уже есть в базе.`);
        }
        allAccounts.push({ email, password });
        await env.ACCOUNTS_KV.put("accounts_list", JSON.stringify(allAccounts));
        return ctx.reply(`✅ Аккаунт добавлен!\n📧 ${email}\n🔑 ${password}\nВсего в базе: ${allAccounts.length}`);
      } catch (e) {
        return ctx.reply(`❌ Ошибка: ${e.message}`);
      }
    });

    bot.command('del', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply('⚠️ Формат: /del email@gmail.com');

      const targetEmail = args[1];

      try {
        let allAccounts = await env.ACCOUNTS_KV.get("accounts_list", { type: "json" }) || [];
        const initialLength = allAccounts.length;
        allAccounts = allAccounts.filter(acc => acc.email !== targetEmail);

        if (allAccounts.length === initialLength) {
          return ctx.reply(`⚠️ Аккаунт с почтой ${targetEmail} не найден в базе.`);
        }

        await env.ACCOUNTS_KV.put("accounts_list", JSON.stringify(allAccounts));
        return ctx.reply(`🗑 Аккаунт ${targetEmail} успешно удален!\nОсталось аккаунтов: ${allAccounts.length}`);
      } catch (e) {
        return ctx.reply(`❌ Ошибка: ${e.message}`);
      }
    });

    bot.command('list', async (ctx) => {
      try {
        let allAccounts = await env.ACCOUNTS_KV.get("accounts_list", { type: "json" }) || [];
        if (allAccounts.length === 0) return ctx.reply('📭 База аккаунтов пуста.');

        let msg = `📋 Список аккаунтов (${allAccounts.length} шт):\n\n`;
        allAccounts.forEach((acc, index) => {
          msg += `${index + 1}. 📧 ${acc.email}\n    🔑 ${acc.password}\n\n`;
        });

        if (msg.length > 4000) {
          msg = msg.substring(0, 4000) + "\n... (список слишком длинный)";
        }
        return ctx.reply(msg);
      } catch (e) {
        return ctx.reply(`❌ Ошибка: ${e.message}`);
      }
    });

    try {
      await bot.handleUpdate(await request.json());
    } catch (e) {}

    return new Response('OK');
  }
};

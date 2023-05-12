import { SlashCommandBuilder } from 'discord.js';


import { mongo } from '../lib/mongo.js';
import { DataBaseResponse, DatabaseHandler } from '../lib/databaseHandler.js';
import { DiscordUser, MinecraftUser, TwitchUser, User } from '../lib/interfaces.js';
import { getMinecraftUser, getTwitchUserFromUsername } from '../lib/accountUtils.js';


const db = new DatabaseHandler(mongo);


export const command = {
	data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your accounts')
        .addSubcommand(subcommand =>
            subcommand.setName('twitch')
                .setDescription('Link your Twitch account')
                .addStringOption(option =>
                    option.setName('twitch_username')
                        .setDescription('Your Twitch username')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('game')
                .setDescription('Link your game account')
                .addStringOption(option =>
                    option.setName('platform')
                        .setDescription('The platform/game you play on')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Minecraft', value: 'minecraft' },
                            { name: 'Steam64 ID', value: 'steam64' },
                ))
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Your username in the platform/game')
                        .setRequired(true)
                )
        ),
    async execute(interaction: any) {
        await interaction.deferReply({ ephemeral: true });
        const subcommand = interaction.options.getSubcommand();
        const discordID = interaction.user.id;

        let dbresult: DataBaseResponse<User>;
        switch (subcommand) {
            // Link Game Account
            case "game":
                const platform = interaction.options.getString('platform');
                const username = interaction.options.getString('username');

                let data: DataBaseResponse<User> = await db.getUser("discord", "id", discordID);
                let user: User = data.success ? data.data : { id: "", discord: <DiscordUser>interaction.user };

                switch (platform) {
                    // Minecraft
                    case "minecraft":
                        const minecraftUser: MinecraftUser = await getMinecraftUser(username);

                        if (!minecraftUser) {
                            const embed = {
                                color: 0xe6d132,
                                description: "Invalid Minecraft username",
                            };
                            return await interaction.editReply({ embeds: [embed]});
                        }

                        dbresult = await db.updateUser(user.id, { minecraft: minecraftUser });

                        if (dbresult?.error) {
                            // if (dbresult.error.code === '23505') {
                            //     const embed = {
                            //         color: 0xe6d132,
                            //         description: "This Minecraft account has already been linked",
                            //     };
                            //     return await interaction.editReply({ embeds: [embed]});
                            // }
                            const embed = {
                                color: 0xbf0f0f,
                                description: "An error occurred while linking your account",
                            };
                            return await interaction.editReply({ embeds: [embed]});
                        }

                        const accountType = username.match(/^\.+[^\s]+$/) ? 'Minecraft Bedrock' : 'Minecraft Java';

                        const embed = {
                            color: 0x65bf65,
                            description: `Your ${accountType} account has been linked`,
                        };
                        return await interaction.editReply({ embeds: [embed]});
                }

                // Generic catch-all
                dbresult = await db.updateUser(user.id, { [platform]: username });
            // Link Twitch Account
            case "twitch":
                const twitchUsername: string = interaction.options.getString('twitch_username');

                // get twitchUser from twitchUsername
                const twitchUser: TwitchUser = await getTwitchUserFromUsername(twitchUsername);

                if (!twitchUser) {
                    const embed = {
                        color: 0xe6d132,
                        description: "Invalid Twitch username",
                    };
                    return await interaction.editReply({ embeds: [embed]});
                }

                // Get User from TwitchUser
                dbresult = await db.getUser("twitch", "id", twitchUser.id);

                if (dbresult?.error) {
                    console.log(dbresult.error);
                    const embed = {
                        color: 0xbf0f0f,
                        description: "An error occurred while linking your account",
                    };
                    return await interaction.editReply({ embeds: [embed]});
                }

                // Check to see if linking the right user
                if (interaction.user.tag === dbresult?.data?.discord?.tag?.split("?confirm?")[0]) {
                    // Merge old user data into new user -- TODO: make this better
                    let oldUserID = (await db.getUser("discord", "id", discordID))?.data?.id;
                    if (oldUserID) {
                        const olddbresult = await db.getUserByID(oldUserID);
                        const delOldUser = await db.deleteUser(oldUserID);
                        if (olddbresult?.data) {
                            let oldUser = olddbresult.data;
                            oldUser.id = user.id;
                            const updateUser = { ...oldUser, ...dbresult?.data}
                            dbresult = await db.updateUser(user.id, updateUser);
                        }
                    }

                    dbresult = await db.updateUser(user.id, {
                        discord: interaction.user,
                        twitch: twitchUser
                    });

                // Message if no link pending
                } else {
                    const embed = {
                        color: 0xe6d132,
                        description: "There is no link pending for this Twitch account, please link your Discord account in Twitch chat:\n```!link discord username#0000```",
                    };
                    return await interaction.editReply({ embeds: [embed]});
                }

                if (dbresult?.error) {
                    console.log(dbresult.error);
                    const embed = {
                        color: 0xbf0f0f,
                        description: "An error occurred while linking your account",
                    };
                    return await interaction.editReply({ embeds: [embed]});
                }

                const embed = {
                    color: 0x65bf65,
                    description: "Your Twitch account has been linked",
                };
                return await interaction.editReply({ embeds: [embed]});
        }

        if (dbresult?.error) {
            console.log(dbresult.error);
            const embed = {
                color: 0xbf0f0f,
                description: "An error occurred while linking your account",
            };
            await interaction.editReply({ embeds: [embed]});
        }

        const embed = {
            color: 0x65bf65,
            description: "Your account has been linked",
        };
        await interaction.editReply({ embeds: [embed]});
    }
};

import dotenv from 'dotenv';
dotenv.config();

// 僅在 CLI 預覽腳本環境中補齊測試環境變數 (0 侵入正式專案碼)
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
}
if (!process.env.SUPABASE_KEY) {
  process.env.SUPABASE_KEY = 'placeholder-key';
}

import { commandsList } from '../src/utils/commands';
import { helpService } from '../src/services/helpService';

/**
 * 開發者專用 CLI Help 指令預覽與配額統計腳本
 * 使用方式：
 *   npx ts-node scripts/previewHelp.ts         (印出全系統大中小類統計與所有指令展平說明)
 *   npx ts-node scripts/previewHelp.ts role    (印出大中小類統計與 role 指令族之詳細說明)
 */
function runHelpPreview() {
  const targetCategory = process.argv[2]?.trim().toLowerCase();

  console.log('============================================================');
  console.log('ButaiDCBot Help 指令預覽與統計工具 (僅供開發調校)');
  console.log('============================================================\n');

  // 為全系統指令做一次 Choices 注入測試
  const helpCmd = commandsList.find((c) => c.data.name === 'help');
  if (helpCmd) {
    helpService.injectCategoryChoices(helpCmd);
  }

  // 1. 大中小類統計與 Discord 配額防錯檢查
  let totalTopCommands = 0;
  let totalSubcommandGroups = 0;
  let totalSubcommands = 0;
  let categoryChoiceCount = 0;

  const categoryDetails: Array<{
    name: string;
    description: string;
    annotations: string[];
    groupsCount: number;
    subsCount: number;
    items: Array<{
      fullName: string;
      description: string;
      annotations: string[];
      skipAuditLog: boolean;
    }>;
  }> = [];

  for (const cmd of commandsList) {
    totalTopCommands++;
    categoryChoiceCount++;

    const name = cmd.data.name;
    const json = cmd.data.toJSON();
    const mainDesc = json.description || '無描述資訊';
    const mainAnnotations = cmd.annotations || [];
    const skipAuditLog = !!cmd.skipAuditLog;

    const options = json.options || [];
    const groups = options.filter((opt: any) => opt.type === 2);
    const directSubcommands = options.filter((opt: any) => opt.type === 1);

    const items: Array<{
      fullName: string;
      description: string;
      annotations: string[];
      skipAuditLog: boolean;
    }> = [];

    if (groups.length > 0 || directSubcommands.length > 0) {
      if (groups.length > 0) {
        totalSubcommandGroups += groups.length;
        for (const g of groups) {
          const gName = g.name;
          const gSubs = g.options?.filter((sub: any) => sub.type === 1) || [];
          totalSubcommands += gSubs.length;

          for (const sub of gSubs) {
            const subName = sub.name;
            const subDesc = sub.description || '無描述資訊';
            const fullKey = `${gName}/${subName}`;
            const subMeta = cmd.subcommandsMetadata?.[fullKey] || cmd.subcommandsMetadata?.[subName];

            items.push({
              fullName: `/${name} ${gName} ${subName}`,
              description: subDesc,
              annotations: subMeta?.annotations || [],
              skipAuditLog,
            });
          }
        }
      }

      if (directSubcommands.length > 0) {
        totalSubcommands += directSubcommands.length;
        for (const sub of directSubcommands) {
          const subName = sub.name;
          const subDesc = sub.description || '無描述資訊';
          const subMeta = cmd.subcommandsMetadata?.[subName];

          items.push({
            fullName: `/${name} ${subName}`,
            description: subDesc,
            annotations: subMeta?.annotations || [],
            skipAuditLog,
          });
        }
      }
    } else {
      totalSubcommands += 1;
      items.push({
        fullName: `/${name}`,
        description: mainDesc,
        annotations: mainAnnotations,
        skipAuditLog,
      });
    }

    categoryDetails.push({
      name,
      description: mainDesc,
      annotations: mainAnnotations,
      groupsCount: groups.length,
      subsCount: items.length,
      items,
    });
  }

  // 印出統計數據與配額預警
  console.log('📊 【大中小類指令統計與 Discord 配額檢核】');
  console.log(`  • 大類 (Top-level Commands):  ${totalTopCommands} / 100 (上限 100)`);
  console.log(`  • 中類 (Subcommand Groups):   ${totalSubcommandGroups}`);
  console.log(`  • 小類 (Subcommands Total):   ${totalSubcommands}`);
  console.log(`  • Choices 選項數:             ${categoryChoiceCount} / 25  (上限 25)\n`);

  if (totalTopCommands > 100) {
    console.log('❌ [DANGER] 頂層指令數超過 100 個，Discord 將無法成功部署！');
  } else if (totalTopCommands >= 80) {
    console.log('⚠️ [WARN] 頂層指令數已達上限 80% (>=80 個)，請注意規劃！');
  }

  if (categoryChoiceCount > 25) {
    console.log('❌ [DANGER] Help Category Choice 選項超過 25 個，Discord Choices 將溢出！');
  } else if (categoryChoiceCount >= 20) {
    console.log('⚠️ [WARN] Help Category Choice 已接近上限 25 個 (>=20 個)，建議使用下拉選單！');
  }

  console.log('------------------------------------------------------------\n');

  // 2. 格式化展平輸出指令說明與註解
  const filterList = targetCategory
    ? categoryDetails.filter((c) => c.name.toLowerCase() === targetCategory)
    : categoryDetails;

  if (targetCategory && filterList.length === 0) {
    console.log(`⚠️ 找不到名為 "${targetCategory}" 的指令大類！`);
    console.log(`目前有的指令大類: ${categoryDetails.map((c) => c.name).join(', ')}\n`);
    process.exit(0);
  }

  console.log(
    targetCategory
      ? `🔍 【指令大類 "${targetCategory}" 詳細內容】`
      : '📜 【全系統指令展平預覽 (無分頁限制)】'
  );

  for (const cat of filterList) {
    const mainAnnoStr =
      cat.annotations.length > 0 ? `  ${cat.annotations.map((a) => `${a}`).join(' ')}` : '';
    console.log(`\n▶ [${cat.name}] ${cat.description}${mainAnnoStr}`);
    console.log(`  包含 ${cat.items.length} 個子指令/條目：`);

    for (const item of cat.items) {
      const subAnnoStr =
        item.annotations.length > 0
          ? `  ${item.annotations.map((a) => `${a}`).join(' ')}`
          : '';
      const auditStr = item.skipAuditLog ? '  (不紀錄Log)' : '';
      console.log(`    • ${item.fullName}  ${subAnnoStr}${auditStr}`.trimEnd());
      console.log(`      描述: ${item.description}`);
    }
  }

  console.log('\n============================================================');
  console.log('✅ 預覽完成！');
  console.log('============================================================');

  // 輸出完成後自動終止進程，避免背景 Redis 自動重連產生連線警報
  process.exit(0);
}

runHelpPreview();

<script setup lang="ts">
// 流程指引 — 公开静态页（无需登录）
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 overflow-y-auto bg-white dark:bg-gray-900">
    <!-- ═══ Hero ═══ -->
    <section class="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-gray-900 px-4 sm:px-6 py-10 lg:py-14">
      <div class="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
      <div class="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-sky-400/10 blur-3xl pointer-events-none" />
      <div class="relative z-10 max-w-3xl mx-auto text-center">
        <nav class="inline-flex items-center gap-1 p-1 mb-6 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
          <ULink to="/apply" class="px-3.5 py-1.5 rounded-full text-xs font-medium text-white/75 hover:text-white hover:bg-white/10 transition">调解申请</ULink>
          <ULink to="/guide" class="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white/25 text-white">流程指引</ULink>
          <ULink to="/party" class="px-3.5 py-1.5 rounded-full text-xs font-medium text-white/75 hover:text-white hover:bg-white/10 transition">进入我的案件</ULink>
        </nav>
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs text-white/80 mb-4">
          <UIcon name="i-lucide-book-open" class="w-3.5 h-3.5" />
          <span>操作指南</span>
        </div>
        <h1 class="text-3xl sm:text-4xl font-bold text-white">流程指引</h1>
        <p class="mt-3 text-base sm:text-lg text-blue-200 max-w-2xl mx-auto">当事人使用本平台的完整操作指南</p>
      </div>
    </section>

    <!-- ═══ Guide Content ═══ -->
    <section class="flex-1 px-4 sm:px-6 py-8 lg:py-12">
      <div class="max-w-3xl mx-auto space-y-8">

        <!-- Step 1 -->
        <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">1</span>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">AI 咨询</h3>
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <p>在首页 <strong>进入我的案件</strong> 页面底部，您可以直接与 AI 助手对话，描述您遇到的商事纠纷。</p>
            <p>AI 会采用分阶段心理咨询模式（倾听 → 共情 → 重塑 → 协商），前 3-4 轮以倾听和了解情况为主，不会直接提供解决方案。</p>
            <p>当您确认需要正式申请调解时，点击左侧菜单 <strong>创建新的案件</strong> 上传材料。</p>
          </div>
        </div>

        <!-- Step 2 -->
        <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">2</span>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">上传材料并创建案件</h3>
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <p>点击左侧菜单 <strong>创建新的案件</strong>，在右侧上传相关证据材料。</p>
            <p>支持 PDF、Word、图片、文本文件，单文件最大 50MB。可通过拖拽或点击选择文件。</p>
            <p>上传完成后点击 <strong>创建案件</strong> 按钮，系统将自动生成案件编号和访问验证码，请妥善保存。</p>
          </div>
        </div>

        <!-- Step 3 -->
        <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">3</span>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">查看案件</h3>
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <p>点击左侧菜单 <strong>进入我的案件</strong>，输入案件编号和访问验证码即可进入案件详情页。</p>
            <p>在案件详情页，您可以查看案件信息、与 AI 智能体继续对话，或选择调解员进行人工调解。</p>
          </div>
        </div>

        <!-- Step 4 -->
        <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">4</span>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">选择调解员</h3>
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <p>在案件详情页点击 <strong>与调解员对话</strong>，浏览可用的调解员信息（专长、学历、单位）。</p>
            <p>选择一位调解员后，案件状态将变为"进行中"，您可以与调解员实时交流。</p>
          </div>
        </div>

        <!-- Step 5 -->
        <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">5</span>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">AI 智能体咨询与调解员介入</h3>
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <p>进入案件后，AI助手会自动为您提供初步咨询，采用分阶段心理咨询模式（倾听 → 共情 → 重塑 → 协商）。</p>
            <p>咨询 3 轮后，系统会为您匹配调解员。如需调解员帮助，点击 <strong>联系调解员</strong> 按钮，调解员将接管对话。</p>
            <p>调解员介入后，您可与调解员直接沟通，AI助手将停止回复。</p>
          </div>
        </div>

        <!-- Step 6 -->
        <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">6</span>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">调解结果与费用说明</h3>
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
            <p>调解成功后，您可以根据实际情况选择以下路径：</p>
            <ul class="list-disc pl-5 space-y-1">
              <li><strong>撤回仲裁申请</strong>：调解达成和解 → 撤回仲裁申请 → 退回仲裁费用</li>
              <li><strong>调解 + 仲裁</strong>：调解达成协议 → 仲裁庭出具调解书/裁决书 → 仲裁费用按 <strong>50%</strong> 收取</li>
              <li><strong>继续仲裁</strong>：调解未果 → 正式立案进入仲裁程序</li>
            </ul>
          </div>
        </div>

        <!-- Fee Comparison -->
        <div class="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-6">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-badge-dollar-sign" class="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 class="text-base font-semibold text-green-900 dark:text-green-100">费用优势对比</h3>
          </div>
          <div class="text-sm text-green-800 dark:text-green-200 space-y-2 leading-relaxed">
            <p>依据《广州仲裁委员会仲裁收费、退费指引》，通过调解解决纠纷可显著降低费用：</p>
            <div class="overflow-x-auto">
              <table class="w-full text-sm border-collapse">
                <thead>
                  <tr class="border-b border-green-300 dark:border-green-700">
                    <th class="text-left py-2 pr-4 font-medium">解决路径</th>
                    <th class="text-left py-2 pr-4 font-medium">仲裁费用</th>
                    <th class="text-left py-2 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-green-200 dark:divide-green-800">
                  <tr>
                    <td class="py-2 pr-4">立案前调解成功撤回</td>
                    <td class="py-2 pr-4 font-medium text-green-700 dark:text-green-300">全额退回</td>
                    <td class="py-2">受理前撤回，费用全部退还</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4">受理后组庭前调解撤回</td>
                    <td class="py-2 pr-4 font-medium text-green-700 dark:text-green-300">退全部受理费 + 50%处理费</td>
                    <td class="py-2">已交费用大部分退还</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4">调解达成协议 → 仲裁出具调解书</td>
                    <td class="py-2 pr-4 font-medium text-green-700 dark:text-green-300">按标准 50% 收取</td>
                    <td class="py-2">调解和解后仲裁确认，费用减半</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4">直接进入仲裁程序</td>
                    <td class="py-2 pr-4 text-gray-500 dark:text-gray-400">按标准全额收取</td>
                    <td class="py-2">正常仲裁流程</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-xs text-green-600 dark:text-green-400 mt-2">* 以上依据《广州仲裁委员会仲裁收费、退费指引》（2025年1月1日施行）</p>
          </div>
        </div>

        <!-- Privacy Notice -->
        <div class="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-blue-500 dark:text-blue-400" />
            <h3 class="text-base font-semibold text-blue-900 dark:text-blue-100">隐私保护</h3>
          </div>
          <div class="text-sm text-blue-700 dark:text-blue-300 space-y-2 leading-relaxed">
            <p>您与 AI 的私聊内容对调解员不可见，只有您主动发送的消息和调解员的消息才会在调解员端显示。</p>
            <p>全程加密传输，保护您的商业秘密和隐私。</p>
          </div>
        </div>

        <!-- CTA -->
        <div class="text-center pt-4">
          <UButton
            to="/party"
            size="lg"
            class="shadow-lg hover:shadow-xl transition-shadow"
          >
            <template #leading>
              <UIcon name="i-lucide-user-plus" class="w-4 h-4" />
            </template>
            开始在线调解
            <template #trailing>
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
            </template>
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>

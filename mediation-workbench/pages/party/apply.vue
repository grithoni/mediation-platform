<template>
  <div class="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-900">
    <!-- ================= Header ================= -->
    <div class="shrink-0 p-6 border-b border-gray-200 dark:border-gray-800">
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-file-plus" class="w-6 h-6 text-blue-500 dark:text-blue-400" />
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">提交调解申请</h2>
      </div>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">请完整填写调解申请书并上传相关材料，提交后系统将自动为您创建案件</p>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0">
      <div class="max-w-3xl mx-auto p-6 space-y-6">
        <!-- ================= Section 1: 调解申请书 ================= -->
        <section class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
          <div class="flex items-center gap-2 mb-1">
            <span class="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">1</span>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">调解申请书</h3>
          </div>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">带 * 为必填项</p>

          <!-- OCR Auto-fill -->
          <div class="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-5">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-lucide-scan-text" class="w-4 h-4 text-blue-500 dark:text-blue-400" />
              <span class="text-sm font-semibold text-blue-900 dark:text-blue-100">智能识别 · 自动回填</span>
            </div>
            <p class="text-xs text-blue-700 dark:text-blue-300 mb-3">上传调解申请书（PDF/Word/图片），系统将自动识别并回填表单字段</p>
            <div class="flex items-center gap-3">
              <label class="flex-1 cursor-pointer">
                <div
                  class="flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg text-sm transition-colors"
                  :class="ocrFile
                    ? 'border-green-400 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300'
                    : 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-100/50 dark:hover:bg-blue-900/30'"
                >
                  <UIcon :name="ocrFile ? 'i-lucide-file-check' : 'i-lucide-upload'" class="w-4 h-4 shrink-0" />
                  <span class="truncate">{{ ocrFile ? ocrFile.name : '选择文件' }}</span>
                  <span class="ml-auto text-xs opacity-70">{{ ocrFile ? formatFileSize(ocrFile.size) : 'PDF/Word/图片' }}</span>
                </div>
                <input
                  type="file"
                  class="hidden"
                  accept=".pdf,.docx,.jpg,.jpeg,.png,.bmp,.webp,.tiff"
                  @change="onOcrFileChange"
                />
              </label>
              <UButton
                size="md"
                :loading="ocrLoading"
                :disabled="!ocrFile"
                icon="i-lucide-wand-2"
                class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100 shrink-0"
                @click="runOcr"
              >
                开始识别
              </UButton>
            </div>
            <div v-if="ocrStatus" class="mt-2 flex items-center gap-1.5 text-xs" :class="ocrError ? 'text-red-500' : 'text-green-600 dark:text-green-400'">
              <UIcon v-if="ocrLoading" name="i-lucide-loader-2" class="w-3 h-3 animate-spin" />
              <UIcon v-else :name="ocrError ? 'i-lucide-alert-circle' : 'i-lucide-check-circle-2'" class="w-3 h-3" />
              <span>{{ ocrStatus }}</span>
            </div>
          </div>

          <!-- Applicant -->
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">申请人</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-1">
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">名称 <span class="text-red-500">*</span></label>
              <UInput v-model="form.applicantName" placeholder="申请人名称" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('applicantName') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">地址</label>
              <UInput v-model="form.applicantAddress" placeholder="通讯地址" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('applicantAddress') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">邮政编码</label>
              <UInput v-model="form.applicantPostalCode" placeholder="邮政编码" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('applicantPostalCode') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">固定电话</label>
              <UInput v-model="form.applicantPhone" placeholder="固定电话" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('applicantPhone') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">移动电话</label>
              <UInput v-model="form.applicantMobile" placeholder="移动电话" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('applicantMobile') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">传真</label>
              <UInput v-model="form.applicantFax" placeholder="传真" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('applicantFax') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">邮箱</label>
              <UInput v-model="form.applicantEmail" placeholder="电子邮箱" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('applicantEmail') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">其他联系方式</label>
              <UInput v-model="form.applicantOtherContact" placeholder="其他联系方式" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('applicantOtherContact') }" />
            </div>
          </div>

          <!-- Respondent -->
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white mt-5 mb-3">被申请人</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-1">
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">名称 <span class="text-red-500">*</span></label>
              <UInput v-model="form.respondentName" placeholder="被申请人名称" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('respondentName') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">地址</label>
              <UInput v-model="form.respondentAddress" placeholder="通讯地址" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('respondentAddress') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">邮政编码</label>
              <UInput v-model="form.respondentPostalCode" placeholder="邮政编码" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('respondentPostalCode') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">固定电话</label>
              <UInput v-model="form.respondentPhone" placeholder="固定电话" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('respondentPhone') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">移动电话</label>
              <UInput v-model="form.respondentMobile" placeholder="移动电话" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('respondentMobile') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">传真</label>
              <UInput v-model="form.respondentFax" placeholder="传真" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('respondentFax') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">邮箱</label>
              <UInput v-model="form.respondentEmail" placeholder="电子邮箱" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('respondentEmail') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">其他联系方式</label>
              <UInput v-model="form.respondentOtherContact" placeholder="其他联系方式" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('respondentOtherContact') }" />
            </div>
          </div>

          <!-- Willingness -->
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white mt-5 mb-2">调解意愿</h4>
          <div class="flex gap-4 mb-1">
            <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input v-model="form.mediationWillingness" type="radio" value="mutual" class="accent-blue-500" />
              各方自愿
            </label>
            <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input v-model="form.mediationWillingness" type="radio" value="single_party" class="accent-blue-500" />
              单方请求
            </label>
          </div>

          <!-- Case Info -->
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white mt-5 mb-3">案件信息</h4>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">案件事实</label>
              <UTextarea v-model="form.caseFacts" placeholder="请陈述纠纷发生的事实经过" :rows="3" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('caseFacts') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">争议事项</label>
              <UTextarea v-model="form.disputeMatters" placeholder="双方争议的核心事项" :rows="3" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('disputeMatters') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">调解诉求</label>
              <UTextarea v-model="form.mediationDemands" placeholder="您希望通过调解达成的诉求" :rows="3" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('mediationDemands') }" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">理据</label>
              <UTextarea v-model="form.demandsBasis" placeholder="诉求所依据的理由、证据或合同条款" :rows="3" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('demandsBasis') }" />
            </div>
          </div>
        </section>

        <!-- ================= Section 2: 证据材料 ================= -->
        <section class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
          <div class="flex items-center gap-2 mb-1">
            <span class="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">2</span>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">证据材料</h3>
          </div>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">支持 PDF、Word、图片、压缩包等格式，单文件最大 50MB</p>

          <div
            class="border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-3"
            :class="evidenceDragging
              ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950'
              : 'border-gray-300 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'"
            @dragover.prevent="evidenceDragging = true"
            @dragleave.prevent="evidenceDragging = false"
            @drop.prevent="onEvidenceDrop"
          >
            <UIcon name="i-lucide-upload-cloud" class="w-8 h-8 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">拖拽证据文件到此处，或</p>
            <label class="inline-block cursor-pointer">
              <span class="text-sm text-blue-500 dark:text-blue-400 hover:underline">点击选择文件</span>
              <input type="file" multiple class="hidden" accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.zip,.rar,.7z,.xls,.xlsx,.csv,.md" @change="onEvidenceSelect" />
            </label>
          </div>

          <div v-if="evidenceFiles.length" class="space-y-2 mb-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-500 dark:text-gray-400">已上传 {{ evidenceFiles.length }} 个文件</span>
              <button class="text-xs text-red-500 hover:underline" @click="evidenceFiles = []">清空全部</button>
            </div>
            <div
              v-for="(file, i) in evidenceFiles"
              :key="i"
              class="flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <UIcon name="i-lucide-file" class="w-4 h-4 text-gray-400" />
              <span class="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{{ file.name }}</span>
              <span class="text-xs text-gray-400 font-mono">{{ formatFileSize(file.size) }}</span>
              <button class="text-gray-400 hover:text-red-500" @click="evidenceFiles.splice(i, 1)">
                <UIcon name="i-lucide-x" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input v-model="evidenceConfidential" type="checkbox" class="accent-amber-500" />
            上述证据材料涉及商业秘密，申请保密处理
          </label>
        </section>

        <!-- ================= Section 3: 身份证明文件 ================= -->
        <section class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
          <div class="flex items-center gap-2 mb-1">
            <span class="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">3</span>
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">身份证明文件</h3>
          </div>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">请上传申请人的身份证明文件（身份证、营业执照等）</p>

          <div
            class="border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-3"
            :class="identityDragging
              ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950'
              : 'border-gray-300 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'"
            @dragover.prevent="identityDragging = true"
            @dragleave.prevent="identityDragging = false"
            @drop.prevent="onIdentityDrop"
          >
            <UIcon name="i-lucide-upload-cloud" class="w-8 h-8 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">拖拽身份证明文件到此处，或</p>
            <label class="inline-block cursor-pointer">
              <span class="text-sm text-blue-500 dark:text-blue-400 hover:underline">点击选择文件</span>
              <input type="file" multiple class="hidden" accept=".pdf,.jpg,.jpeg,.png,.bmp,.webp,.tiff,.doc,.docx" @change="onIdentitySelect" />
            </label>
          </div>

          <div v-if="identityFiles.length" class="space-y-2 mb-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-500 dark:text-gray-400">已上传 {{ identityFiles.length }} 个文件</span>
              <button class="text-xs text-red-500 hover:underline" @click="identityFiles = []">清空全部</button>
            </div>
            <div
              v-for="(file, i) in identityFiles"
              :key="i"
              class="flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <UIcon name="i-lucide-file" class="w-4 h-4 text-gray-400" />
              <span class="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{{ file.name }}</span>
              <span class="text-xs text-gray-400 font-mono">{{ formatFileSize(file.size) }}</span>
              <button class="text-gray-400 hover:text-red-500" @click="identityFiles.splice(i, 1)">
                <UIcon name="i-lucide-x" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Agent -->
          <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer mb-3">
              <input v-model="hasAgent" type="checkbox" class="accent-blue-500" />
              由代理人代为申请
            </label>
            <div v-if="hasAgent" class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">代理人姓名</label>
                <UInput v-model="form.agentName" placeholder="代理人姓名" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('agentName') }" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">代理人职责</label>
                <UInput v-model="form.agentDuties" placeholder="如：代为提交材料、参与调解" class="w-full" :class="{ 'ring-2 ring-green-400': isHighlighted('agentDuties') }" />
              </div>
            </div>
            <div v-if="hasAgent">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">授权委托书</label>
              <div
                class="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
                :class="authDragging
                  ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-gray-300 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'"
                @dragover.prevent="authDragging = true"
                @dragleave.prevent="authDragging = false"
                @drop.prevent="onAuthDrop"
              >
                <UIcon name="i-lucide-file-signature" class="w-6 h-6 text-gray-400 dark:text-gray-600 mx-auto mb-1" />
                <label class="inline-block cursor-pointer">
                  <span class="text-xs text-blue-500 dark:text-blue-400 hover:underline">拖拽或点击上传授权委托书</span>
                  <input type="file" multiple class="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" @change="onAuthSelect" />
                </label>
              </div>
              <div v-if="authFiles.length" class="space-y-2 mt-3">
                <div
                  v-for="(file, i) in authFiles"
                  :key="i"
                  class="flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <UIcon name="i-lucide-file" class="w-4 h-4 text-gray-400" />
                  <span class="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{{ file.name }}</span>
                  <span class="text-xs text-gray-400 font-mono">{{ formatFileSize(file.size) }}</span>
                  <button class="text-gray-400 hover:text-red-500" @click="authFiles.splice(i, 1)">
                    <UIcon name="i-lucide-x" class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- ================= Error ================= -->
    <div v-if="submitError" class="shrink-0 px-6">
      <UAlert color="error" variant="soft" :title="submitError" icon="i-lucide-alert-triangle" />
    </div>

    <!-- ================= Submit Bar ================= -->
    <div class="shrink-0 p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div class="max-w-3xl mx-auto flex items-center justify-between gap-4">
        <div class="text-xs text-gray-400 dark:text-gray-500">
          {{ evidenceFiles.length + identityFiles.length + authFiles.length }} 个附件待提交
        </div>
        <UButton
          size="lg"
          :loading="submitting"
          :disabled="!form.applicantName.trim() || !form.respondentName.trim()"
          icon="i-lucide-send"
          class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
          @click="submitApplication"
        >
          提交申请
        </UButton>
      </div>
    </div>

    <!-- ================= Success Modal ================= -->
    <UModal v-model="successOpen" :overlay="true">
      <div class="p-6 text-center">
        <UIcon name="i-lucide-circle-check" class="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">调解申请提交成功</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">请妥善保存以下信息，用于查询案件进度</p>
        <div class="space-y-2 bg-gray-50 dark:bg-gray-950 rounded-lg p-4 text-left mb-6">
          <div class="flex justify-between">
            <span class="text-sm text-gray-500">案件编号</span>
            <span class="text-sm font-mono font-medium text-gray-900 dark:text-white">{{ createdCaseNumber }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-sm text-gray-500">访问验证码</span>
            <span class="text-sm font-mono font-medium text-gray-900 dark:text-white">{{ createdAccessCode }}</span>
          </div>
        </div>
        <div class="flex justify-center gap-3">
          <UButton
            variant="soft"
            color="gray"
            @click="resetForm"
          >
            再提交一份
          </UButton>
          <UButton
            class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
            @click="goToCreatedCase"
          >
            进入案件
          </UButton>
        </div>
      </div>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const router = useRouter()

// ---------- OCR ----------
const ocrFile = ref<File | null>(null)
const ocrLoading = ref(false)
const ocrStatus = ref('')
const ocrError = ref(false)

function onOcrFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.length) {
    ocrFile.value = target.files[0]
    ocrStatus.value = ''
    ocrError.value = false
  }
}

// snake_case (from OCR) -> camelCase (form field)
const FIELD_MAP: Record<string, keyof typeof form> = {
  applicant_name: 'applicantName',
  applicant_address: 'applicantAddress',
  applicant_postal_code: 'applicantPostalCode',
  applicant_phone: 'applicantPhone',
  applicant_mobile: 'applicantMobile',
  applicant_fax: 'applicantFax',
  applicant_email: 'applicantEmail',
  applicant_other_contact: 'applicantOtherContact',
  respondent_name: 'respondentName',
  respondent_address: 'respondentAddress',
  respondent_postal_code: 'respondentPostalCode',
  respondent_phone: 'respondentPhone',
  respondent_mobile: 'respondentMobile',
  respondent_fax: 'respondentFax',
  respondent_email: 'respondentEmail',
  respondent_other_contact: 'respondentOtherContact',
  mediation_willingness: 'mediationWillingness',
  case_facts: 'caseFacts',
  dispute_matters: 'disputeMatters',
  mediation_demands: 'mediationDemands',
  demands_basis: 'demandsBasis',
  agent_name: 'agentName',
  agent_duties: 'agentDuties',
}

const highlighted = ref<Set<string>>(new Set())
let highlightTimers: number[] = []

function isHighlighted(key: string) {
  return highlighted.value.has(key)
}

function flashHighlight(key: string) {
  highlighted.value = new Set(highlighted.value).add(key)
  highlightTimers.push(window.setTimeout(() => {
    highlighted.value = new Set([...highlighted.value].filter(k => k !== key))
  }, 2000))
}

async function runOcr() {
  if (!ocrFile.value) return
  ocrLoading.value = true
  ocrError.value = false
  ocrStatus.value = '正在识别文本...'
  try {
    const fd = new FormData()
    fd.append('file', ocrFile.value)
    const resp = await $fetch<{ success: boolean; method?: string; used_ocr?: boolean; text_length?: number; fields?: Record<string, string>; error?: string }>('/api/ocr', {
      method: 'POST',
      body: fd,
    })
    if (resp.success && resp.fields) {
      let count = 0
      const methodLabel = resp.method === 'docx' ? 'Word提取' : resp.method === 'pdf-electronic' ? 'PDF文本' : 'OCR识别'
      for (const [k, v] of Object.entries(resp.fields)) {
        const key = FIELD_MAP[k]
        if (key && v) {
          if (key === 'mediationWillingness' && (v === 'mutual' || v === 'single_party')) {
            form.mediationWillingness = v
          } else {
            ;(form as any)[key] = v
          }
          flashHighlight(key as string)
          count++
        }
      }
      if (hasAgent.value === false && (form.agentName || form.agentDuties)) {
        hasAgent.value = true
      }
      ocrStatus.value = `✓ ${methodLabel}完成，已回填 ${count} 个字段`
    } else {
      ocrError.value = true
      ocrStatus.value = resp.error || '识别失败，请检查文件内容'
    }
  } catch (err: any) {
    ocrError.value = true
    ocrStatus.value = `识别服务暂不可用：${err?.message || '请稍后重试'}`
  } finally {
    ocrLoading.value = false
  }
}

// ---------- Form State ----------
const form = reactive({
  applicantName: '',
  applicantAddress: '',
  applicantPostalCode: '',
  applicantPhone: '',
  applicantMobile: '',
  applicantFax: '',
  applicantEmail: '',
  applicantOtherContact: '',
  respondentName: '',
  respondentAddress: '',
  respondentPostalCode: '',
  respondentPhone: '',
  respondentMobile: '',
  respondentFax: '',
  respondentEmail: '',
  respondentOtherContact: '',
  mediationWillingness: '',
  caseFacts: '',
  disputeMatters: '',
  mediationDemands: '',
  demandsBasis: '',
  agentName: '',
  agentDuties: '',
})

const evidenceConfidential = ref(false)
const hasAgent = ref(false)

// ---------- File Lists ----------
const evidenceFiles = ref<File[]>([])
const identityFiles = ref<File[]>([])
const authFiles = ref<File[]>([])
const evidenceDragging = ref(false)
const identityDragging = ref(false)
const authDragging = ref(false)

function addFiles(target: File[], list: File[]) {
  for (const file of target) {
    if (file.size > 50 * 1024 * 1024) continue
    if (!list.value.find(f => f.name === file.name && f.size === file.size)) {
      list.value.push(file)
    }
  }
}

function onEvidenceDrop(e: DragEvent) {
  evidenceDragging.value = false
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files, evidenceFiles)
}
function onEvidenceSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) addFiles(target.files, evidenceFiles)
}
function onIdentityDrop(e: DragEvent) {
  identityDragging.value = false
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files, identityFiles)
}
function onIdentitySelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) addFiles(target.files, identityFiles)
}
function onAuthDrop(e: DragEvent) {
  authDragging.value = false
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files, authFiles)
}
function onAuthSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) addFiles(target.files, authFiles)
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

// ---------- Submit ----------
const submitting = ref(false)
const submitError = ref('')
const successOpen = ref(false)
const createdCaseNumber = ref('')
const createdAccessCode = ref('')

async function submitApplication() {
  submitError.value = ''
  submitting.value = true
  try {
    const fd = new FormData()
    fd.append('caseType', 'mediation')
    fd.append('partyName', form.applicantName.trim())
    fd.append('respondentName', form.respondentName.trim())
    fd.append('disputeType', form.disputeMatters.trim() || form.caseFacts.trim().slice(0, 50))
    fd.append('description', `${form.caseFacts}\n\n争议事项：${form.disputeMatters}\n\n诉求：${form.mediationDemands}\n\n理据：${form.demandsBasis}`.trim())
    for (const [k, v] of Object.entries(form)) {
      fd.append(k, String(v))
    }
    fd.append('evidenceConfidential', evidenceConfidential.value ? 'true' : 'false')
    fd.append('hasAgent', hasAgent.value ? 'true' : 'false')
    for (const file of evidenceFiles.value) fd.append('evidence_files', file)
    for (const file of identityFiles.value) fd.append('identity_files', file)
    for (const file of authFiles.value) fd.append('authorization_files', file)

    const resp = await $fetch<{ success: boolean; data: { caseNumber: string; accessCode: string; applicantName?: string } }>('/api/cases/create', {
      method: 'POST',
      body: fd,
    })
    createdCaseNumber.value = resp.data.caseNumber
    createdAccessCode.value = resp.data.accessCode
    successOpen.value = true
  } catch (err: any) {
    submitError.value = `提交失败：${err?.message || '请稍后重试'}`
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  successOpen.value = false
  createdCaseNumber.value = ''
  createdAccessCode.value = ''
  Object.keys(form).forEach(k => (form as any)[k] = '')
  evidenceConfidential.value = false
  hasAgent.value = false
  evidenceFiles.value = []
  identityFiles.value = []
  authFiles.value = []
  ocrFile.value = null
  ocrStatus.value = ''
  ocrError.value = false
  highlighted.value = new Set()
  highlightTimers.forEach(t => window.clearTimeout(t))
  highlightTimers = []
  submitError.value = ''
  router.push('/party/apply')
}

function goToCreatedCase() {
  router.push(`/party/case/${createdCaseNumber.value}?code=${createdAccessCode.value}`)
}

onBeforeUnmount(() => {
  highlightTimers.forEach(t => window.clearTimeout(t))
})
</script>

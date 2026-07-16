pipeline {
    agent any

    environment {
        // 自動抓取當前分支名稱 (例如 dev)
        BRANCH_NAME = "${GIT_BRANCH.split('/').last()}"
        IMAGE_NAME = "butaidcbot:${BRANCH_NAME}"
        CONTAINER_NAME = "butaidcbot-${BRANCH_NAME}"
    }

    stages {
        stage('1. 下載程式碼 (Checkout)') {
            steps { checkout scm }
        }

        stage('2. 打包 Docker Image') {
            steps {
                sh "docker build -t ${IMAGE_NAME} ."
            }
        }

        stage('3. 啟動本地容器 (Deploy Local)') {
            steps {
                script {
                    echo "🔍 當前偵測到的分支名稱為: ${BRANCH_NAME}"
                    echo "🔑 預計尋找的憑證 ID 為: env-secret-bot-${BRANCH_NAME}"
                    withCredentials([file(credentialsId: "env-secret-bot-${BRANCH_NAME}", variable: 'SECRET_ENV_FILE')]) {
                        
                        // 把保險箱裡的檔案複製到當前目錄下，命名為 .env.${BRANCH_NAME}
                        sh "cp \$SECRET_ENV_FILE .env.${BRANCH_NAME}"
                        
                        // 動態從 .env 中抓取 HEALTH_PORT 變數，給後續的健康檢查使用
                        // 如果 .env 裡面沒寫，預設防呆為 5000
                        env.TARGET_PORT = sh(script: "grep '^HEALTH_PORT=' .env.${BRANCH_NAME} | cut -d '=' -f2 || echo 5000", returnStdout: true).trim()
                        if (env.TARGET_PORT == "") { env.TARGET_PORT = "5000" }
                        echo "🎯 從 .env 讀取到的 Health Port 為: ${env.TARGET_PORT}"

                        // 確保刪除舊的同名容器
                        sh "docker rm -f ${CONTAINER_NAME} || true"
                        
                        // 啟動新容器，餵給它 .env.${BRANCH_NAME}，共享 Host 網路以便 Jenkins 在 localhost 檢測狀態
                        sh """
                        docker run -d \
                            --name ${CONTAINER_NAME} \
                            --env-file .env.${BRANCH_NAME} \
                            --network="host" \
                            --restart unless-stopped \
                            ${IMAGE_NAME}
                        """
                        
                        // 啟動完成後，立刻銷毀臨時的機密檔案
                        sh "rm -f .env.${BRANCH_NAME}"
                    }
                }
            }
        }
        
        stage('4. 健康檢查 (Health Check)') {
            steps {
                script {
                    echo "🔍 開始對 http://localhost:${env.TARGET_PORT}/health 進行健康檢查..."
                    
                    // 使用 sh 執行 Bash 迴圈進行重試，等待 Bot 客戶端完成 Ready
                    sh """
                    MAX_RETRIES=15
                    SLEEP_TIME=3
                    
                    for i in \$(seq 1 \$MAX_RETRIES); do
                        STATUS_CODE=\$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${env.TARGET_PORT}/health || echo "000")
                        
                        if [ "\$STATUS_CODE" = "200" ]; then
                            echo "✅ Discord Bot 啟動且登入 Discord 成功！收到 200 OK。"
                            exit 0
                        fi
                        
                        echo "⏳ 機器人尚未就緒或未成功登入 Discord (狀態碼: \$STATUS_CODE)... 等待 \$SLEEP_TIME 秒後重試 (\$i/\$MAX_RETRIES)"
                        sleep \$SLEEP_TIME
                    done
                    
                    echo "❌ 健康檢查失敗！機器人未能成功連接 Discord 伺服器。"
                    echo "📜 以下是容器的最後 20 行 Log 錯誤訊息："
                    docker logs ${CONTAINER_NAME} --tail 20
                    exit 1
                    """
                }
            }
        }
    }
    
    post {
        always {
            sh "rm -f .env.* || true"
            sh "docker image prune -f || true"
        }
    }
}

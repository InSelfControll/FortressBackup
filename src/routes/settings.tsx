import { createFileRoute } from '@tanstack/react-router'
import { Settings as SettingsComponent } from '../../components/Settings'
import { useApp } from '../contexts/AppContext'
import { AIConfig, DatabaseConfig, SSOConfig } from '../../types'
import * as API from '../../client/api/index.js'

export const Route = createFileRoute('/settings')({
  component: SettingsComponentWrapper,
})

function SettingsComponentWrapper() {
  const { 
    aiConfig, 
    dbConfig, 
    ssoConfig,
    setAiConfig,
    setDbConfig,
    setSsoConfig,
    handleExportData,
    handleImportData,
    handleResetApp 
  } = useApp()
  
  const updateAIConfig = async (config: AIConfig) => {
    setAiConfig(config)
    try {
      await API.saveConfig('ai_config', config)
    } catch (e) { 
      console.error('Failed to save AI config:', e) 
    }
  }

  const updateDBConfig = async (config: DatabaseConfig) => {
    setDbConfig(config)
    try {
      await API.saveConfig('db_config', config)
    } catch (e) { 
      console.error('Failed to save DB config:', e) 
    }
  }

  const updateSSOConfig = async (config: SSOConfig) => {
    setSsoConfig(config)
    try {
      await API.saveConfig('sso_config', config)
    } catch (e) { 
      console.error('Failed to save SSO config:', e) 
    }
  }
  
  return (
    <SettingsComponent 
      aiConfig={aiConfig}
      dbConfig={dbConfig}
      ssoConfig={ssoConfig}
      onUpdateAIConfig={updateAIConfig}
      onUpdateDBConfig={updateDBConfig}
      onUpdateSSOConfig={updateSSOConfig}
      onResetApp={handleResetApp}
      onExportData={handleExportData}
      onImportData={handleImportData}
    />
  )
}
package com.iftin.resellers.data

import android.content.Context
import androidx.room.*

@Entity(tableName = "delivery_tasks")
data class DeliveryTask(
    @PrimaryKey val id: String,
    val orderId: String,
    val providerName: String,
    val ussdCode: String,
    val receiverPhone: String,
    val packageCode: String?,
    val status: String, // "pending", "processing", "completed", "failed"
    val attempts: Int,
    val createdAt: Long,
    val processedAt: Long? = null,
    val errorMessage: String? = null
)

@Dao
interface DeliveryTaskDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(task: DeliveryTask)
    
    @Query("SELECT * FROM delivery_tasks WHERE status = 'pending' ORDER BY createdAt ASC")
    suspend fun getPendingTasks(): List<DeliveryTask>
    
    @Query("SELECT COUNT(*) FROM delivery_tasks WHERE status = 'pending'")
    suspend fun getPendingCount(): Int
    
    @Query("SELECT COUNT(*) FROM delivery_tasks WHERE status = 'processing'")
    suspend fun getProcessingCount(): Int
    
    @Query("UPDATE delivery_tasks SET status = :status WHERE id = :id")
    suspend fun updateStatus(id: String, status: String)
    
    @Query("SELECT * FROM delivery_tasks ORDER BY createdAt DESC LIMIT 100")
    suspend fun getRecentTasks(): List<DeliveryTask>
    
    @Query("DELETE FROM delivery_tasks WHERE createdAt < :timestamp")
    suspend fun deleteOldTasks(timestamp: Long)
}

@Database(entities = [DeliveryTask::class], version = 1)
abstract class DeliveryDatabase : RoomDatabase() {
    abstract fun deliveryTaskDao(): DeliveryTaskDao
    
    companion object {
        @Volatile
        private var INSTANCE: DeliveryDatabase? = null
        
        fun getInstance(context: Context): DeliveryDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    DeliveryDatabase::class.java,
                    "iftin_data_database"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
